import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { resolve } from "node:path";
import { toolDefinitions, executeTool } from "./tools.js";
import db, { logAction } from "./lib/supabase.js";

config({ path: resolve(import.meta.dirname, "../../.env") });

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the Email Nurture Agent for the Ben Lalez real estate team at Compass in Chicago.

## Your Job
1. Process nurture tasks assigned by other agents (Referral Agent, Orchestrator)
2. Identify leads that need drip touches (no contact in 3+ days)
3. Send personalized emails via SendGrid and SMS via Twilio
4. Add leads to ActiveCampaign automations when appropriate

## Email Strategy
- **New leads (score 0-49):** Intro email with market insights, establish value
- **Warm leads (score 50-79):** Property recommendations, neighborhood guides, mortgage tips
- **Hot leads (score 80+):** Urgent call-to-action, showing availability, time-sensitive content
- **Referral outreach:** Warm check-in, subtle referral ask, anniversary messages

## Email Rules
- Always fetch brand voice before writing
- Keep subject lines under 50 chars, personal tone
- HTML emails should be clean, mobile-friendly, no heavy images
- Include unsubscribe language in footer
- Never send more than 1 email per lead per 3 days
- SMS must be under 160 chars, conversational
- Always mark tasks as completed after sending
- Log every send to Supabase

## Tone
- Warm, knowledgeable, never pushy
- Reference Chicago neighborhoods by name
- Position Ben as a trusted advisor, not a salesperson`;

const RUN_MODES = {
  process_tasks: "Check for pending nurture tasks from other agents. Claim each task, fetch the lead details, write and send the appropriate outreach, then mark the task complete.",
  drip_cycle: "Find leads that haven't been contacted in 3+ days. Fetch brand voice, then send personalized drip emails based on their score and stage.",
  full_cycle: "First process all pending tasks from other agents. Then run a drip cycle for leads needing touches.",
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
  if (!checkCredentials('Email Nurture', ['ANTHROPIC_API_KEY'])) return;

  // --- Token spend tracking ---
  let _totalInputTokens = 0, _totalOutputTokens = 0, _cacheReadTokens = 0, _cacheWriteTokens = 0;

  const startTime = Date.now();
  await logAction("agent_run_start", "success", { mode });
  console.log(`[Email Nurture] Starting ${mode} at ${new Date().toISOString()}`);

  const messages = [{ role: "user", content: RUN_MODES[mode] || RUN_MODES.full_cycle }];
  let continueLoop = true;
  let iterations = 0;

  while (continueLoop && iterations < 30) {
    iterations++;
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }], tools: toolDefinitions, messages,
    });

    
    // Track token usage
    if (response.usage) {
      _totalInputTokens += response.usage.input_tokens || 0;
      _totalOutputTokens += response.usage.output_tokens || 0;
      _cacheReadTokens += response.usage.cache_read_input_tokens || 0;
      _cacheWriteTokens += response.usage.cache_creation_input_tokens || 0;
    }
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "tool_use") {
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`[Email Nurture]   Tool: ${block.name}`);
          const result = await executeTool(block.name, block.input);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      continueLoop = false;
      const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      if (text) console.log(`[Email Nurture] Summary: ${text}`);
    }
  }

  const duration = Date.now() - startTime;
  // Log API spend
  const _inputCost = (_totalInputTokens / 1_000_000) * 3.0;
  const _outputCost = (_totalOutputTokens / 1_000_000) * 15.0;
  const _cacheSavings = (_cacheReadTokens / 1_000_000) * 3.0 * 0.9;
  const _estimatedCost = _inputCost + _outputCost - _cacheSavings;
  try {
    await db().from("api_spend").insert({
      agent_name: "email_nurture",
      model: "claude-sonnet-4-6",
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
  console.log(`[Email Nurture] Done in ${(duration / 1000).toFixed(1)}s`);
}

async function startScheduler() {
  console.log("[Email Nurture] Scheduler started");
  try { await runAgent("full_cycle"); } catch (e) { console.error(e.message); }

  // Process tasks every 10 minutes, full drip cycle every 6 hours
  setInterval(async () => {
    try { await runAgent("process_tasks"); } catch (e) { console.error(e.message); }
  }, 10 * 60 * 1000);

  setInterval(async () => {
    try { await runAgent("drip_cycle"); } catch (e) { console.error(e.message); }
  }, 6 * 60 * 60 * 1000);
}

const mode = process.argv[2];
if (mode === "daemon") startScheduler();
else runAgent(mode || "full_cycle").then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
