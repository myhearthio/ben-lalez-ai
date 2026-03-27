import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { resolve } from "node:path";
import { toolDefinitions, executeTool } from "./tools.js";
import { logAction } from "./lib/supabase.js";

config({ path: resolve(import.meta.dirname, "../../.env") });
const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the Intelligence & Research Agent for the Ben Lalez real estate team at Compass in Chicago.

## Your Job
Research the Chicago real estate market and feed actionable intelligence to every other agent. You are the brain that keeps the entire system informed and ahead of the market.

## Research Areas
1. **Market Trends**: Median prices, inventory levels, days on market, absorption rates by neighborhood
2. **Neighborhood Intelligence**: New developments, zoning changes, school ratings, transit updates, restaurant/retail openings
3. **Competitor Activity**: Other top agents' listings, marketing strategies, pricing patterns
4. **Seasonal Patterns**: Best listing months, buyer activity cycles, rate change impacts
5. **Lead Source Analysis**: Which channels produce the highest-quality leads and best conversion rates

## Target Neighborhoods
Lincoln Park, Lakeview, Gold Coast, Wicker Park, Logan Square, Bucktown, West Loop, Old Town, Streeterville, River North, Andersonville, Ravenswood, Hyde Park, South Loop

## Publishing Rules
- Every insight gets a confidence score (0.0-1.0)
- Tag insights with relevant neighborhoods
- Set target_agents when an insight is specifically useful for one agent
- Avoid duplicate insights — check existing intelligence first
- Clean up expired intelligence each cycle
- High confidence (0.8+): verified data from reliable sources
- Medium confidence (0.5-0.8): trend observations, aggregated signals
- Low confidence (0.3-0.5): early signals, anecdotal

## Intelligence Types
- market_trend: pricing, inventory, demand shifts
- competitor: other agents/teams activity
- neighborhood: local developments and changes
- seasonal: timing-based patterns and cycles
- lead_pattern: source/channel performance analysis`;

const RUN_MODES = {
  market_research: "Research current Chicago real estate market conditions. Search for recent pricing trends, inventory changes, and market outlook. Publish insights tagged to relevant neighborhoods.",
  neighborhood_scan: "Deep dive into 2-3 neighborhoods. Research new developments, local news, and community changes that affect property values or buyer interest.",
  competitor_watch: "Research competitor activity — top Chicago agents/teams, their listings, pricing strategies, marketing approaches.",
  lead_analysis: "Analyze lead source statistics to identify which channels produce the best leads. Publish insights for the Ads and Content agents.",
  full_cycle: "Run a complete research cycle: expire stale intelligence, research market trends, scan key neighborhoods, analyze lead sources, and publish all findings.",
};

// --- Circuit Breaker: skip cycle if required credentials are missing ---
const _cbLogged = {};
function checkCredentials(agent, required) {
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    const key = missing.join(',');
    if (!_cbLogged[key]) {
      console.warn('[' + agent + '] CIRCUIT BREAKER: Missing ' + missing.join(', ') + ' - skipping cycle');
      _cbLogged[key] = true;
    }
    return false;
  }
  return true;
}

async function runAgent(mode = "full_cycle") {
  if (!checkCredentials('Intelligence', ['ANTHROPIC_API_KEY'])) return;

  const startTime = Date.now();
  await logAction("agent_run_start", "success", { mode });
  console.log(`[Intelligence] Starting ${mode} at ${new Date().toISOString()}`);

  const messages = [{ role: "user", content: RUN_MODES[mode] || RUN_MODES.full_cycle }];
  let continueLoop = true, iterations = 0;

  while (continueLoop && iterations < 30) {
    iterations++;
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 4096,
      system: SYSTEM_PROMPT, tools: toolDefinitions, messages,
    });
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "tool_use") {
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`[Intelligence]   Tool: ${block.name}`);
          const result = await executeTool(block.name, block.input);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      continueLoop = false;
      const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      if (text) console.log(`[Intelligence] Summary: ${text}`);
    }
  }

  const duration = Date.now() - startTime;
  await logAction("agent_run_complete", "success", { mode, iterations, durationMs: duration }, null, duration);
  console.log(`[Intelligence] Done in ${(duration / 1000).toFixed(1)}s`);
}

async function startScheduler() {
  console.log("[Intelligence] Scheduler started");
  try { await runAgent("full_cycle"); } catch (e) { console.error(e.message); }
  // Full research every 6 hours
  setInterval(async () => { try { await runAgent("full_cycle"); } catch (e) { console.error(e.message); } }, 6 * 60 * 60 * 1000);
}

const mode = process.argv[2];
if (mode === "daemon") startScheduler();
else runAgent(mode || "full_cycle").then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
