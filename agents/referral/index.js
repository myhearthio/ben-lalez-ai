import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { resolve } from "node:path";
import { toolDefinitions, executeTool } from "./tools.js";
import db, { logAction } from "./lib/supabase.js";

config({ path: resolve(import.meta.dirname, "../../.env") });

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the Referral Agent for the Ben Lalez real estate team at Compass in Chicago. You run 24/7 as part of an autonomous marketing operating system.

Your job is to generate referral business from past clients. Referrals are the highest-converting lead source in real estate — your work directly drives closings.

## Strategy

### 1. Anniversary Touchpoints
- Check for clients whose home purchase anniversary is within 14 days
- Create personalized anniversary outreach (email preferred)
- Include a subtle referral ask: "Know anyone thinking of buying or selling?"
- For high-value closings ($500K+), notify Ben for a personal call

### 2. Referral Ask Campaigns
- Identify closed clients who haven't been contacted in 30+ days
- Prioritize by closing value and relationship strength
- Create warm check-in messages that naturally lead to a referral ask
- Rotate message types: market update, home value check, neighborhood news, holiday greeting

### 3. Referral Pipeline Tracking
- Monitor active leads that came from referrals
- Track conversion rates from referral source
- Publish insights about which client segments generate the most referrals

### 4. High-Value Opportunity Alerts
- For clients with $750K+ closings or known social networks, alert Ben directly
- These need personal attention — a phone call or handwritten note, not automated outreach

## Outreach Tone
- Warm, personal, never salesy
- Reference specific details: their home, neighborhood, closing date
- Frame referrals as helping friends, not generating business
- Keep messages short — 2-3 sentences for SMS, 4-5 for email

## Rules
- Never contact the same client more than once per 30 days
- Always check last_touch_at before creating outreach
- Prioritize anniversary clients — they have the highest referral conversion rate
- For $750K+ closings, always notify Ben instead of automating
- Publish insights when you spot patterns in referral data`;

const RUN_MODES = {
  anniversaries: "Check for clients with upcoming purchase anniversaries (next 14 days). Create personalized anniversary outreach for each. For high-value clients ($750K+), notify Ben for personal attention instead.",
  referral_asks: "Find closed clients who haven't been contacted in 30+ days. Create referral ask outreach tasks for the nurture agent. Prioritize by closing value.",
  pipeline_check: "Check the current referral pipeline — active leads from referral sources. Analyze patterns and publish any insights.",
  full_cycle: "Run a complete referral cycle: first handle anniversaries, then create referral ask outreach for dormant clients, then check the referral pipeline for insights.",
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
  if (!checkCredentials('Referral', ['ANTHROPIC_API_KEY'])) return;

  // --- Token spend tracking ---
  let _totalInputTokens = 0, _totalOutputTokens = 0, _cacheReadTokens = 0, _cacheWriteTokens = 0;

  const startTime = Date.now();
  const userPrompt = RUN_MODES[mode] || RUN_MODES.full_cycle;

  await logAction("agent_run_start", "success", { mode });
  console.log(`[Referral] Starting ${mode} run at ${new Date().toISOString()}`);

  const messages = [{ role: "user", content: userPrompt }];
  let continueLoop = true;
  let iterations = 0;
  const MAX_ITERATIONS = 25;

  while (continueLoop && iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: toolDefinitions,
      messages,
    });

    const assistantContent = response.content;
    
    // Track token usage
    if (response.usage) {
      _totalInputTokens += response.usage.input_tokens || 0;
      _totalOutputTokens += response.usage.output_tokens || 0;
      _cacheReadTokens += response.usage.cache_read_input_tokens || 0;
      _cacheWriteTokens += response.usage.cache_creation_input_tokens || 0;
    }
    messages.push({ role: "assistant", content: assistantContent });

    if (response.stop_reason === "tool_use") {
      const toolResults = [];
      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          console.log(`[Referral]   Tool: ${block.name}(${JSON.stringify(block.input).substring(0, 120)})`);
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
        console.log(`[Referral] Summary: ${textBlocks.map((b) => b.text).join("\n")}`);
      }
    }
  }

  const duration = Date.now() - startTime;
  // Log API spend
  const _inputCost = (_totalInputTokens / 1_000_000) * 1.0;
  const _outputCost = (_totalOutputTokens / 1_000_000) * 5.0;
  const _cacheSavings = (_cacheReadTokens / 1_000_000) * 1.0 * 0.9;
  const _estimatedCost = _inputCost + _outputCost - _cacheSavings;
  try {
    await db().from("api_spend").insert({
      agent_name: "referral",
      model: "claude-haiku-4-5-20251001",
      input_tokens: _totalInputTokens,
      output_tokens: _totalOutputTokens,
      cache_read_tokens: _cacheReadTokens,
      cache_write_tokens: _cacheWriteTokens,
      estimated_cost_usd: _estimatedCost,
      duration_ms: duration,
      run_mode: mode,
      iterations,
    });
  } catch (e) { console.warn("Failed to log spend:", e.message); }

  await logAction("agent_run_complete", "success", { mode, iterations, durationMs: duration }, null, duration);
  console.log(`[Referral] Completed ${mode} in ${(duration / 1000).toFixed(1)}s (${iterations} iterations)`);
}

async function startScheduler() {
  console.log("[Referral] Scheduler started");

  // Run full cycle on startup
  try {
    await runAgent("full_cycle");
  } catch (err) {
    console.error("[Referral] Error in initial run:", err.message);
    await logAction("agent_run_error", "error", { mode: "full_cycle" }, err.message);
  }

  // Check anniversaries daily at startup + every 12 hours
  setInterval(async () => {
    try {
      await runAgent("full_cycle");
    } catch (err) {
      console.error("[Referral] Error:", err.message);
      await logAction("agent_run_error", "error", { mode: "full_cycle" }, err.message);
    }
  }, 12 * 60 * 60 * 1000);
}

const mode = process.argv[2];
if (mode === "daemon") {
  startScheduler();
} else {
  runAgent(mode || "full_cycle")
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Referral] Fatal:", err);
      process.exit(1);
    });
}
