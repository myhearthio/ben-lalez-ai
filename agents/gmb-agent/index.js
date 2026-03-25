import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { resolve } from "node:path";
import { toolDefinitions, executeTool } from "./tools.js";
import { logAction } from "./lib/supabase.js";

// Load .env from project root
config({ path: resolve(import.meta.dirname, "../../.env") });

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the Reputation & GMB Agent for the Ben Lalez real estate team at Compass in Chicago. You run 24/7 as part of an autonomous marketing operating system.

Your two jobs:

## Job 1: Review Monitoring
- Check Google, Zillow, and Facebook for new reviews
- Log every review found to Supabase via the log_reviews tool
- For 4-5 star reviews: log them and move on
- For 1-3 star reviews: fetch the brand voice, draft a professional empathetic response, then create a Tier 1 (critical) notification so Ben can review and approve it before it gets posted

When drafting responses to negative reviews:
- Be empathetic, professional, and solution-oriented
- Never be defensive or dismissive
- Acknowledge the concern, apologize for the experience, and offer to resolve offline
- Keep responses under 200 words
- Include an invitation to contact Ben directly

## Job 2: GMB Posting (3x per week)
- Check posting status to see how many posts were made this week
- If fewer than 3 posts this week, create a new GMB post
- Before writing, check recent posts to avoid duplicate topics and fetch market intelligence for relevant content
- Fetch the brand voice to stay on-brand
- Post types to rotate between:
  - Market updates (Chicago neighborhoods, pricing trends)
  - Team highlights and recent closings
  - Community content (local events, neighborhood spotlights)
  - Tips for buyers and sellers
  - Just listed / just sold highlights
- Keep posts engaging, locally relevant, and under 1500 characters
- Include a call-to-action when appropriate

## General Rules
- Log every action to Supabase
- Never post a reply to a negative review without Ben's approval
- Always fetch brand voice before writing any content
- Use market intelligence from other agents to inform your posts`;

const RUN_MODES = {
  review_check: "Check all three review platforms (Google, Zillow, Facebook) for new reviews. For each platform: use check_reviews, then log_reviews for any found. For any 1-3 star reviews, fetch brand voice first, draft a response, and create a notification for Ben.",
  gmb_post: "Check the current posting status. If fewer than 3 GMB posts this week, create one. First check recent posts and market intelligence for topic ideas, fetch brand voice, then publish a fresh post.",
  full_cycle: "Run a complete cycle: first check all review platforms, handle any negative reviews, then check if a GMB post is needed this week and publish one if so.",
};

async function runAgent(mode = "full_cycle") {
  const startTime = Date.now();
  const userPrompt = RUN_MODES[mode] || RUN_MODES.full_cycle;

  await logAction("agent_run_start", "success", { mode });
  console.log(`[GMB Agent] Starting ${mode} run at ${new Date().toISOString()}`);

  const messages = [{ role: "user", content: userPrompt }];

  let continueLoop = true;
  let iterations = 0;
  const MAX_ITERATIONS = 25;

  while (continueLoop && iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    // Collect all tool results for this turn
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    if (response.stop_reason === "tool_use") {
      const toolResults = [];

      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          console.log(`[GMB Agent]   Tool: ${block.name}(${JSON.stringify(block.input).substring(0, 100)})`);
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
      // end_turn or no more tool calls
      continueLoop = false;
      const textBlocks = assistantContent.filter((b) => b.type === "text");
      if (textBlocks.length > 0) {
        console.log(`[GMB Agent] Summary: ${textBlocks.map((b) => b.text).join("\n")}`);
      }
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.warn(`[GMB Agent] Hit max iterations (${MAX_ITERATIONS}), stopping.`);
    await logAction("agent_run_max_iterations", "warning", { mode, iterations });
  }

  const duration = Date.now() - startTime;
  await logAction("agent_run_complete", "success", { mode, iterations, durationMs: duration }, null, duration);
  console.log(`[GMB Agent] Completed ${mode} run in ${(duration / 1000).toFixed(1)}s (${iterations} iterations)`);
}

// Scheduling: runs review checks every 2 hours, GMB posting check every 8 hours
async function startScheduler() {
  console.log("[GMB Agent] Scheduler started");

  const REVIEW_INTERVAL = 2 * 60 * 60 * 1000;   // 2 hours
  const POST_INTERVAL = 8 * 60 * 60 * 1000;      // 8 hours

  // Run full cycle on startup
  try {
    await runAgent("full_cycle");
  } catch (err) {
    console.error("[GMB Agent] Error in initial run:", err.message);
    await logAction("agent_run_error", "error", { mode: "full_cycle" }, err.message);
  }

  // Schedule review checks
  setInterval(async () => {
    try {
      await runAgent("review_check");
    } catch (err) {
      console.error("[GMB Agent] Error in review check:", err.message);
      await logAction("agent_run_error", "error", { mode: "review_check" }, err.message);
    }
  }, REVIEW_INTERVAL);

  // Schedule GMB posting checks
  setInterval(async () => {
    try {
      await runAgent("gmb_post");
    } catch (err) {
      console.error("[GMB Agent] Error in GMB post run:", err.message);
      await logAction("agent_run_error", "error", { mode: "gmb_post" }, err.message);
    }
  }, POST_INTERVAL);
}

// Entry point: support both single run and continuous scheduler
const mode = process.argv[2];

if (mode === "daemon") {
  startScheduler();
} else {
  runAgent(mode || "full_cycle")
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[GMB Agent] Fatal error:", err);
      process.exit(1);
    });
}
