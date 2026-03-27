import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { resolve } from "node:path";
import { toolDefinitions, executeTool } from "./tools.js";
import { logAction } from "./lib/supabase.js";

config({ path: resolve(import.meta.dirname, "../../.env") });
const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the Content & SEO Agent for the Ben Lalez real estate team at Compass in Chicago.

## Your Job
1. Publish 2-3 SEO-optimized blog posts per week to WordPress
2. Schedule 5+ social media posts per week via Buffer
3. Use market intelligence from other agents to create timely, relevant content

## Blog Strategy
- Target long-tail Chicago real estate keywords
- Neighborhoods: Lincoln Park, Lakeview, Gold Coast, Wicker Park, Logan Square, Bucktown, West Loop, Old Town, Streeterville, River North
- Topics: market updates, neighborhood guides, buyer tips, seller guides, investment analysis, lifestyle/community
- Every post needs: H1 title with keyword, H2 subheadings, internal links, meta description, 800-1500 words
- Write in Ben's voice — authoritative but approachable Chicago expert

## Social Strategy
- Mix: 40% market insights, 30% listings/transactions, 20% community/lifestyle, 10% personal brand
- Instagram: visual, neighborhood-focused, hashtags
- Facebook: longer-form, community engagement
- LinkedIn: professional, market analysis, industry insights
- Always include a call-to-action

## Rules
- Fetch brand voice before writing anything
- Check recent content to avoid duplicate topics
- Use market intelligence for timely angles
- Log every publish to Supabase
- Quality over quantity — every piece should drive traffic or engagement`;

const RUN_MODES = {
  blog: "Check how much content was published this week. If fewer than 3 blog posts, write and publish one. Fetch market intelligence and brand voice first, check recent posts to avoid duplicates.",
  social: "Create and schedule social media posts. Fetch profiles, recent content, and intelligence, then schedule engaging posts across platforms.",
  full_cycle: "Run a full content cycle: check content count, publish a blog post if needed, then schedule social media posts. Always start with brand voice and intelligence.",
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
  if (!checkCredentials('Content SEO', ['ANTHROPIC_API_KEY'])) return;

  const startTime = Date.now();
  await logAction("agent_run_start", "success", { mode });
  console.log(`[Content SEO] Starting ${mode} at ${new Date().toISOString()}`);

  const messages = [{ role: "user", content: RUN_MODES[mode] || RUN_MODES.full_cycle }];
  let continueLoop = true, iterations = 0;

  while (continueLoop && iterations < 25) {
    iterations++;
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 8192,
      system: SYSTEM_PROMPT, tools: toolDefinitions, messages,
    });
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "tool_use") {
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`[Content SEO]   Tool: ${block.name}`);
          const result = await executeTool(block.name, block.input);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      continueLoop = false;
      const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      if (text) console.log(`[Content SEO] Summary: ${text}`);
    }
  }

  const duration = Date.now() - startTime;
  await logAction("agent_run_complete", "success", { mode, iterations, durationMs: duration }, null, duration);
  console.log(`[Content SEO] Done in ${(duration / 1000).toFixed(1)}s`);
}

async function startScheduler() {
  console.log("[Content SEO] Scheduler started");
  try { await runAgent("full_cycle"); } catch (e) { console.error(e.message); }
  // Blog check every 8 hours, social every 4 hours
  setInterval(async () => { try { await runAgent("blog"); } catch (e) { console.error(e.message); } }, 8 * 60 * 60 * 1000);
  setInterval(async () => { try { await runAgent("social"); } catch (e) { console.error(e.message); } }, 4 * 60 * 60 * 1000);
}

const mode = process.argv[2];
if (mode === "daemon") startScheduler();
else runAgent(mode || "full_cycle").then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
