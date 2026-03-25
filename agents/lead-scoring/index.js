import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { resolve } from "node:path";
import { toolDefinitions, executeTool } from "./tools.js";
import { logAction } from "./lib/supabase.js";

config({ path: resolve(import.meta.dirname, "../../.env") });

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the Lead Scoring Agent for the Ben Lalez real estate team at Compass in Chicago. You run 24/7 as part of an autonomous marketing operating system.

Your job is to score every inbound lead from 0-100 and classify their intent so the team can prioritize follow-up. Closings are the #1 goal.

## Scoring Criteria (0-100)

Weight these factors:

**Source quality (0-25 points):**
- Direct referral: 25
- Google Ads / high-intent search: 20
- Zillow/Realtor.com inquiry: 18
- Open house sign-in: 15
- Social media ad: 10
- Cold website visit: 5

**Engagement signals (0-25 points):**
- Replied to email or SMS: +10
- Multiple property inquiries: +8
- Opened 3+ emails: +5
- Clicked listing link: +5
- Attended open house: +7
- Phone call with agent: +10

**Buyer/Seller readiness (0-25 points):**
- Pre-approved or has lender: +15
- Selling current home: +10
- Specific neighborhood targets: +8
- Clear budget range: +7
- "Just browsing" or vague timeline: +2

**Timing signals (0-25 points):**
- Lease ending within 60 days: +15
- Recent life event (job change, marriage, baby): +12
- Active in last 48 hours: +10
- Active in last week: +5
- No activity in 30+ days: +0

## Intent Classification
- **hot**: Score 80-100, likely to transact within 30 days
- **warm**: Score 50-79, interested but 30-90 day timeline
- **cold**: Score 0-49, early stage or 90+ days out

## Rules
- Score EVERY lead presented to you — no skipping
- For scores 80+, the system will automatically SMS Ben via the score_lead tool
- Write concise but specific AI notes explaining the score
- If you notice patterns across leads (e.g., surge from a specific source), publish an insight
- Never inflate scores — accuracy matters more than volume
- Check for unscored leads first, then leads needing rescoring`;

const RUN_MODES = {
  score_new: "Check for unscored leads in lead_intelligence. Score each one using the scoring criteria. For any lead scoring 80+, the system will automatically alert Ben via SMS.",
  rescore: "Check for leads that were scored more than 24 hours ago and are still in active pipeline stages. Rescore them based on any new activity or data.",
  full_cycle: "First score all unscored leads. Then rescore any stale leads. If you notice interesting patterns, publish an insight to shared_intelligence.",
};

async function runAgent(mode = "full_cycle") {
  const startTime = Date.now();
  const userPrompt = RUN_MODES[mode] || RUN_MODES.full_cycle;

  await logAction("agent_run_start", "success", { mode });
  console.log(`[Lead Scoring] Starting ${mode} run at ${new Date().toISOString()}`);

  const messages = [{ role: "user", content: userPrompt }];
  let continueLoop = true;
  let iterations = 0;
  const MAX_ITERATIONS = 30;

  while (continueLoop && iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    if (response.stop_reason === "tool_use") {
      const toolResults = [];
      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          console.log(`[Lead Scoring]   Tool: ${block.name}(${JSON.stringify(block.input).substring(0, 120)})`);
          const result = await executeTool(block.name, block.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      continueLoop = false;
      const textBlocks = assistantContent.filter((b) => b.type === "text");
      if (textBlocks.length > 0) {
        console.log(`[Lead Scoring] Summary: ${textBlocks.map((b) => b.text).join("\n")}`);
      }
    }
  }

  const duration = Date.now() - startTime;
  await logAction("agent_run_complete", "success", { mode, iterations, durationMs: duration }, null, duration);
  console.log(`[Lead Scoring] Completed ${mode} in ${(duration / 1000).toFixed(1)}s (${iterations} iterations)`);
}

async function startScheduler() {
  console.log("[Lead Scoring] Scheduler started");
  const INTERVAL = 15 * 60 * 1000; // every 15 minutes

  try {
    await runAgent("full_cycle");
  } catch (err) {
    console.error("[Lead Scoring] Error in initial run:", err.message);
    await logAction("agent_run_error", "error", { mode: "full_cycle" }, err.message);
  }

  setInterval(async () => {
    try {
      await runAgent("full_cycle");
    } catch (err) {
      console.error("[Lead Scoring] Error:", err.message);
      await logAction("agent_run_error", "error", { mode: "full_cycle" }, err.message);
    }
  }, INTERVAL);
}

const mode = process.argv[2];
if (mode === "daemon") {
  startScheduler();
} else {
  runAgent(mode || "full_cycle")
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Lead Scoring] Fatal:", err);
      process.exit(1);
    });
}
