import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { resolve } from "node:path";
import { toolDefinitions, executeTool } from "./tools.js";
import { logAction } from "./lib/supabase.js";

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

async function runAgent(mode = "full_cycle") {
  const startTime = Date.now();
  await logAction("agent_run_start", "success", { mode });
  console.log(`[Orchestrator] Starting ${mode} at ${new Date().toISOString()}`);

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
          console.log(`[Orchestrator]   Tool: ${block.name}`);
          const result = await executeTool(block.name, block.input);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      continueLoop = false;
      const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      if (text) console.log(`[Orchestrator] Summary: ${text}`);
    }
  }

  const duration = Date.now() - startTime;
  await logAction("agent_run_complete", "success", { mode, iterations, durationMs: duration }, null, duration);
  console.log(`[Orchestrator] Done in ${(duration / 1000).toFixed(1)}s`);
}

async function startScheduler() {
  console.log("[Orchestrator] Scheduler started");
  try { await runAgent("full_cycle"); } catch (e) { console.error(e.message); }

  // Health check every 30 minutes
  setInterval(async () => { try { await runAgent("health_check"); } catch (e) { console.error(e.message); } }, 30 * 60 * 1000);

  // Daily report at each cycle (the agent will skip if already sent today)
  setInterval(async () => { try { await runAgent("daily_report"); } catch (e) { console.error(e.message); } }, 12 * 60 * 60 * 1000);
}

const mode = process.argv[2];
if (mode === "daemon") startScheduler();
else runAgent(mode || "full_cycle").then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
