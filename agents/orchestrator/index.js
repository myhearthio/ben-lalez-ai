import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { resolve } from "node:path";
import { toolDefinitions, executeTool } from "./tools.js";
import db, { logAction } from "./lib/supabase.js";

config({ path: resolve(import.meta.dirname, "../../.env") });

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the Master Orchestrator for the Ben Lalez real estate team AI Marketing OS at Compass in Chicago.
You coordinate 7 other agents and report to Ben. Your job is to keep the entire system running smoothly and driving closings.

## Your Agents
1. Lead Scoring — scores leads 0-100, alerts on hot leads (every 15min)
2. Referral — mines past clients for referrals (every 12h)
3. Email Nurture — sends drip emails and SMS, processes tasks (every 10min)
4. Content SEO — publishes blog posts and social media (blog 8h, social 4h)
5. Paid Ads — manages Google/Meta ad spend (monitor 4h, optimize 12h)
6. GMB Agent — monitors reviews, posts to Google My Business (reviews 2h, posts 8h)
7. Intelligence — researches market trends, competitors, neighborhoods (every 6h)

## Your Responsibilities

### 1. Health Monitoring
- Check that all agents have run recently (within their expected schedule)
- Identify agents with errors and determine if intervention is needed
- Reset stuck tasks, escalate persistent failures to Ben

### 2. Task Management
- Review pending and failed tasks
- Reassign or retry failed tasks when appropriate
- Create new tasks to fill gaps (e.g., if content is behind schedule)

### 3. Pipeline Oversight
- Monitor lead pipeline — ensure hot leads are being followed up
- Check that content output meets targets (3 blog posts/week, 5+ social posts)
- Verify ad spend is within budget

### 4. Daily Reporting
- Generate a concise daily report for Ben covering:
  - Agent health status
  - Pipeline: new leads, hot leads, closings
  - Content: posts published this week
  - Ads: spend and CPL
  - Issues: anything requiring attention

### 5. Cross-Agent Coordination
- If Intelligence Agent finds a trending neighborhood, create tasks for Content and Ads agents
- If Lead Scoring flags a hot lead, ensure Nurture agent follows up immediately
- If a negative review comes in, verify GMB agent has handled it

## Rules
- Be concise in reports — Ben reads these on his phone
- Only alert for genuine issues, not routine operations
- Critical alerts: agent down for 2+ cycles, budget anomaly, system error
- Normal reports: daily summary, weekly metrics`;

const RUN_MODES = {
  health_check: "Check the health of all agents. Look at recent run history, identify any agents that haven't run on schedule, check for errors. Reset any stuck tasks. If any agent has been down for 2+ expected cycles, alert Ben.",
  task_review: "Review all pending, failed, and stuck tasks. Retry failed tasks if appropriate, reset stuck ones, and create new tasks if there are gaps.",
  daily_report: "Generate the daily report for Ben. Pull pipeline stats, content stats, agent health, and pending notifications. Send a concise summary via SMS.",
  full_cycle: "Run a complete orchestration cycle: health check all agents, review tasks, check pipeline stats, verify content output, and generate a daily report if one hasn't been sent today.",
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
  if (!checkCredentials('Orchestrator', ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])) return;

  // --- Token spend tracking ---
  let _totalInputTokens = 0, _totalOutputTokens = 0, _cacheReadTokens = 0, _cacheWriteTokens = 0;

  const startTime = Date.now();
  await logAction("agent_run_start", "success", { mode });
  console.log(`[Orchestrator] Starting ${mode} at ${new Date().toISOString()}`);

  try {
    const messages = [{ role: "user", content: RUN_MODES[mode] || RUN_MODES.full_cycle }];
    let continueLoop = true, iterations = 0;

    while (continueLoop && iterations < 30) {
      iterations++;
      console.log(`[Orchestrator] Iteration ${iterations} — calling Anthropic API...`);

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: toolDefinitions,
        messages,
      });

      console.log(`[Orchestrator] API response: stop_reason=${response.stop_reason}, blocks=${response.content.length}`);
      
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
            console.log(`[Orchestrator]   Tool: ${block.name}`);
            try {
              const result = await executeTool(block.name, block.input);
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
            } catch (toolErr) {
              console.error(`[Orchestrator]   Tool ${block.name} error: ${toolErr.message}`);
              await logAction("tool_error", "error", { tool: block.name, mode, iteration: iterations }, toolErr.message);
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ success: false, error: toolErr.message }), is_error: true });
            }
          }
        }
        messages.push({ role: "user", content: toolResults });
      } else {
        continueLoop = false;
        const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
        if (text) console.log(`[Orchestrator] Summary: ${text.slice(0, 500)}`);
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
      agent_name: "orchestrator",
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
    console.log(`[Orchestrator] Done in ${(duration / 1000).toFixed(1)}s`);
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[Orchestrator] FATAL ERROR in ${mode}: ${err.message}`);
    console.error(err.stack);
    await logAction("agent_run_error", "error", { mode, durationMs: duration, stack: err.stack?.slice(0, 500) }, err.message, duration).catch(e => console.error("[Orchestrator] Failed to log error to Supabase:", e.message));
  }
}

async function startScheduler() {
  console.log("[Orchestrator] Scheduler started");
  console.log(`[Orchestrator] ANTHROPIC_API_KEY set: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`[Orchestrator] SUPABASE_URL set: ${!!process.env.SUPABASE_URL}`);
  console.log(`[Orchestrator] SUPABASE_SERVICE_ROLE_KEY set: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}`);

  // Initial full cycle
  await runAgent("full_cycle");

  // Health check every 30 minutes
  setInterval(async () => {
    await runAgent("health_check");
  }, 30 * 60 * 1000);

  // Daily report every 12 hours
  setInterval(async () => {
    await runAgent("daily_report");
  }, 12 * 60 * 60 * 1000);

  console.log("[Orchestrator] Intervals set — health_check every 30min, daily_report every 12h");
}

const mode = process.argv[2];
if (mode === "daemon") {
  startScheduler();
} else {
  runAgent(mode || "full_cycle").then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
