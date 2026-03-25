import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { resolve } from "node:path";
import { toolDefinitions, executeTool } from "./tools.js";
import { logAction } from "./lib/supabase.js";

config({ path: resolve(import.meta.dirname, "../../.env") });
const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the Paid Ads Agent for the Ben Lalez real estate team at Compass in Chicago.

## Your Job
Manage Google Ads and Meta (Facebook/Instagram) ad campaigns to generate leads at the lowest possible cost per closing.

## Strategy
1. **Monitor**: Pull performance data from both platforms every cycle
2. **Optimize**: Shift budget toward high-performing campaigns, pause underperformers
3. **Report**: Track all metrics in Supabase, publish insights for other agents
4. **Escalate**: Alert Ben for any budget change over 20% or spend anomaly

## Optimization Rules
- Target cost-per-lead under $50 for Google, under $35 for Meta
- If a campaign CPL is 2x target for 3+ days, pause it and notify Ben
- If a campaign is performing well (CPL under target), increase budget by 10-15%
- Never increase total daily spend by more than 20% without Ben's approval
- Focus on Chicago neighborhoods: Lincoln Park, Lakeview, Gold Coast, West Loop, Wicker Park

## Budget Guardrails
- Small adjustments (under 20%): make them automatically, log the reason
- Large adjustments (20%+): create a notification for Ben's approval first
- Never pause ALL campaigns — always keep at least one active per platform

## Metrics to Track
- Impressions, clicks, CTR, CPC, conversions, CPL, spend
- Score each campaign 0-100 based on CPL efficiency

## Intelligence Sharing
- Publish winning keywords and audiences to shared_intelligence
- Share CPL trends so Content Agent can create landing pages for top performers`;

const RUN_MODES = {
  monitor: "Pull campaign performance from both Google Ads and Meta. Update metrics in Supabase. Identify any campaigns that need attention.",
  optimize: "Analyze campaign performance, make small budget adjustments for efficiency, pause underperformers, and notify Ben for large changes.",
  full_cycle: "Full ads cycle: monitor all campaigns, update metrics, optimize budgets, publish insights. Alert Ben for anything requiring approval.",
};

async function runAgent(mode = "full_cycle") {
  const startTime = Date.now();
  await logAction("agent_run_start", "success", { mode });
  console.log(`[Paid Ads] Starting ${mode} at ${new Date().toISOString()}`);

  const messages = [{ role: "user", content: RUN_MODES[mode] || RUN_MODES.full_cycle }];
  let continueLoop = true, iterations = 0;

  while (continueLoop && iterations < 25) {
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
          console.log(`[Paid Ads]   Tool: ${block.name}`);
          const result = await executeTool(block.name, block.input);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      continueLoop = false;
      const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      if (text) console.log(`[Paid Ads] Summary: ${text}`);
    }
  }

  const duration = Date.now() - startTime;
  await logAction("agent_run_complete", "success", { mode, iterations, durationMs: duration }, null, duration);
  console.log(`[Paid Ads] Done in ${(duration / 1000).toFixed(1)}s`);
}

async function startScheduler() {
  console.log("[Paid Ads] Scheduler started");
  try { await runAgent("full_cycle"); } catch (e) { console.error(e.message); }
  // Monitor every 4 hours, optimize every 12 hours
  setInterval(async () => { try { await runAgent("monitor"); } catch (e) { console.error(e.message); } }, 4 * 60 * 60 * 1000);
  setInterval(async () => { try { await runAgent("optimize"); } catch (e) { console.error(e.message); } }, 12 * 60 * 60 * 1000);
}

const mode = process.argv[2];
if (mode === "daemon") startScheduler();
else runAgent(mode || "full_cycle").then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
