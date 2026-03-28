// OLIVER v2.0 — tools.js
// COMPLETE DROP-IN REPLACEMENT for agents/orchestrator/tools.js
// Changes: Added 8 new tools (read_shared_intelligence, get_brand_memory, get_content_calendar,
// send_cowork_message, check_cowork_inbox, get_api_spend, get_lead_details, log_experiment).
// All 14 existing tools preserved exactly.
// New imports: readSharedIntelligence, getBrandMemory, getContentCalendar from lib/supabase.js

import db, { logAction, createNotification, getAgentHealth, getAgentErrors, getPendingTasks, getFailedTasks, getStuckTasks, resetTask, createAgentTask, getPendingNotifications, getPipelineStats, getContentStats, getActiveIntelligence, readSharedIntelligence, getBrandMemory, getContentCalendar } from "./lib/supabase.js";

export const toolDefinitions = [
  // ============================================
  // EXISTING TOOLS (14) — preserved exactly
  // ============================================
  { name: "get_agent_health", description: "Get recent run history for all agents — last run times, durations, errors.", input_schema: { type: "object", properties: {} } },
  { name: "get_agent_errors", description: "Get all agent errors in the last N hours.", input_schema: { type: "object", properties: { hours: { type: "number" } } } },
  { name: "get_pending_tasks", description: "Get all pending tasks in the agent_tasks queue.", input_schema: { type: "object", properties: {} } },
  { name: "get_failed_tasks", description: "Get tasks that have permanently failed.", input_schema: { type: "object", properties: {} } },
  { name: "get_stuck_tasks", description: "Get tasks stuck in_progress for over 2 hours.", input_schema: { type: "object", properties: {} } },
  { name: "reset_stuck_task", description: "Reset a stuck task back to pending for retry.", input_schema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] } },
  {
    name: "create_task",
    description: "Create a new task for a specific agent.",
    input_schema: {
      type: "object",
      properties: {
        assignedAgent: { type: "string", enum: ["lead_scoring", "nurture_agent", "content_seo", "paid_ads", "gmb_agent", "referral_agent", "intelligence", "email_nurture", "preston_pr"] },
        taskType: { type: "string" }, description: { type: "string" },
        payload: { type: "object" }, priority: { type: "number" },
      },
      required: ["assignedAgent", "taskType", "description"],
    },
  },
  { name: "get_pipeline_stats", description: "Get lead pipeline statistics — counts by stage, intent, source.", input_schema: { type: "object", properties: {} } },
  { name: "get_content_stats", description: "Get content published in the last 7 days across all channels (from content_performance table).", input_schema: { type: "object", properties: {} } },
  { name: "get_active_intelligence", description: "Get active intelligence entries from all agents.", input_schema: { type: "object", properties: {} } },
  { name: "get_pending_notifications", description: "Get pending notifications that haven't been sent yet.", input_schema: { type: "object", properties: {} } },
  {
    name: "send_daily_report",
    description: "Send Ben a daily summary report via SMS notification.",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" }, report: { type: "string" } },
      required: ["title", "report"],
    },
  },
  {
    name: "alert_ben",
    description: "Send Ben an urgent alert about a system issue or opportunity.",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" }, message: { type: "string" }, priority: { type: "string", enum: ["critical", "high", "normal"] } },
      required: ["title", "message"],
    },
  },

  // ============================================
  // NEW v2.0 TOOLS (8)
  // ============================================
  {
    name: "read_shared_intelligence",
    description: "Read intelligence from ALL agents with filters. Use to check what Roger published that Content/Ads should act on, monitor intelligence flow, and verify cross-agent coordination. More targeted than get_active_intelligence — supports filtering by source agent, type, tags, and recency.",
    input_schema: {
      type: "object",
      properties: {
        source_agent: { type: "string", description: "Filter by source: intelligence, content_seo, paid_ads, etc." },
        intelligence_type: { type: "string", description: "Filter by type: market_trend, competitor, neighborhood, seasonal, strategic_shift, content_insight, experiment_result" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by overlapping tags" },
        since: { type: "string", description: "ISO date — only intelligence after this date" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "get_brand_memory",
    description: "Read brand memory for brand governance. Check voice rules, approved/rejected phrases, audience definitions. Use when verifying content matches brand_memory voice or flagging violations.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter: voice, rejected_phrase, audience, voice_rule, approved_phrase, audience_def" },
      },
    },
  },
  {
    name: "get_content_calendar",
    description: "Read the content calendar (the PLAN). Different from get_content_stats which reads content_performance (what was PUBLISHED). Use to verify execution against plan — what's scheduled, what's overdue, what's behind.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter: draft, scheduled, published, overdue" },
        assigned_agent: { type: "string", description: "Filter by assigned agent" },
        start_date: { type: "string", description: "ISO date — calendar items on or after" },
        end_date: { type: "string", description: "ISO date — calendar items on or before" },
      },
    },
  },
  {
    name: "send_cowork_message",
    description: "Send a message to another Claude session (Remy, Fields, Ben) via the cowork_messages table. Use for cross-session coordination when issues span agent ownership boundaries.",
    input_schema: {
      type: "object",
      properties: {
        to_persona: { type: "string", description: "Recipient: remy, fields, ben_claude_laptop" },
        subject: { type: "string" },
        body: { type: "string" },
        message_type: { type: "string", enum: ["directive", "request", "update", "alert"], description: "Message type (default: update)" },
      },
      required: ["to_persona", "subject", "body"],
    },
  },
  {
    name: "check_cowork_inbox",
    description: "Check for messages from other Claude sessions. Use to see if Remy, Fields, or Ben have sent directives or updates that affect orchestration priorities.",
    input_schema: {
      type: "object",
      properties: {
        unread_only: { type: "boolean", description: "Only show unread messages (default true)" },
      },
    },
  },
  {
    name: "get_api_spend",
    description: "Get API token spend data by agent. Use to monitor costs, identify expensive agents, track budget efficiency, and optimize. Returns both raw records and per-agent aggregated summary.",
    input_schema: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "Filter by specific agent" },
        since: { type: "string", description: "ISO date — only spend after this date" },
      },
    },
  },
  {
    name: "get_lead_details",
    description: "Get individual lead records with scores. Use when escalating hot leads to Ben — include specific lead data (name, score, price range, neighborhood) in the alert so Ben can act immediately.",
    input_schema: {
      type: "object",
      properties: {
        min_score: { type: "number", description: "Minimum lead score (default 70)" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },
  {
    name: "log_experiment",
    description: "Log a marketing experiment — what was tried, the result, and the learning. Supports Cabane's experimentation mindset: 60-80% should fail. Tracks experiments across agents for monthly review.",
    input_schema: {
      type: "object",
      properties: {
        experiment_name: { type: "string" },
        hypothesis: { type: "string" },
        result: { type: "string", enum: ["success", "failure", "inconclusive"] },
        learning: { type: "string" },
        agent: { type: "string", description: "Which agent ran this experiment" },
      },
      required: ["experiment_name", "hypothesis", "result", "learning"],
    },
  },
];

export async function executeTool(name, input) {
  const start = Date.now();
  try {
    let result;
    switch (name) {
      // ============================================
      // EXISTING TOOL IMPLEMENTATIONS (preserved exactly)
      // ============================================
      case "get_agent_health":
        result = await getAgentHealth();
        await logAction("get_agent_health", "success", { count: result.length });
        break;

      case "get_agent_errors":
        result = await getAgentErrors(input.hours || 24);
        await logAction("get_agent_errors", "success", { count: result.length });
        break;

      case "get_pending_tasks": result = await getPendingTasks(); break;
      case "get_failed_tasks": result = await getFailedTasks(); break;
      case "get_stuck_tasks": result = await getStuckTasks(); break;

      case "reset_stuck_task":
        await resetTask(input.taskId);
        await logAction("reset_stuck_task", "success", { taskId: input.taskId });
        result = { reset: true };
        break;

      case "create_task":
        result = await createAgentTask({ assignedAgent: input.assignedAgent, taskType: input.taskType, description: input.description, payload: input.payload || {}, priority: input.priority || 5 });
        await logAction("create_task", "success", { assignedAgent: input.assignedAgent, taskType: input.taskType });
        break;

      case "get_pipeline_stats": result = await getPipelineStats(); break;
      case "get_content_stats": result = await getContentStats(); break;
      case "get_active_intelligence": result = await getActiveIntelligence(); break;
      case "get_pending_notifications": result = await getPendingNotifications(); break;

      case "send_daily_report": {
        const report = await createNotification({ priority: "normal", title: input.title, message: input.report, data: { type: "daily_report" } });
        await logAction("send_daily_report", "success", { notificationId: report?.id });
        result = { sent: true, notificationId: report?.id };
        break;
      }

      case "alert_ben": {
        const alert = await createNotification({ priority: input.priority || "high", title: input.title, message: input.message });
        await logAction("alert_ben", "success", { notificationId: alert?.id, priority: input.priority });
        result = { sent: true, notificationId: alert?.id };
        break;
      }

      // ============================================
      // NEW v2.0 TOOL IMPLEMENTATIONS (8)
      // ============================================
      case "read_shared_intelligence": {
        result = await readSharedIntelligence({
          sourceAgent: input.source_agent,
          intelligenceType: input.intelligence_type,
          tags: input.tags,
          since: input.since,
          limit: input.limit || 20,
        });
        await logAction("read_shared_intelligence", "success", { count: result.length });
        break;
      }

      case "get_brand_memory": {
        result = await getBrandMemory({ category: input.category });
        await logAction("get_brand_memory", "success", { count: result.length });
        break;
      }

      case "get_content_calendar": {
        result = await getContentCalendar({
          status: input.status,
          assignedAgent: input.assigned_agent,
          startDate: input.start_date,
          endDate: input.end_date,
        });
        await logAction("get_content_calendar", "success", { count: result.length });
        break;
      }

      case "send_cowork_message": {
        const { data, error } = await db()
          .from("cowork_messages")
          .insert({
            from_persona: "oliver_orchestrator",
            to_persona: input.to_persona,
            subject: input.subject,
            body: input.body,
            message_type: input.message_type || "update",
            status: "unread",
          })
          .select()
          .single();
        if (error) throw new Error(`send_cowork_message: ${error.message}`);
        await logAction("send_cowork_message", "success", { to: input.to_persona, subject: input.subject });
        result = { sent: true, id: data.id };
        break;
      }

      case "check_cowork_inbox": {
        let query = db()
          .from("cowork_messages")
          .select("*")
          .eq("to_persona", "oliver_orchestrator")
          .order("created_at", { ascending: false })
          .limit(20);

        if (input.unread_only !== false) query = query.eq("status", "unread");

        const { data, error } = await query;
        if (error) throw new Error(`check_cowork_inbox: ${error.message}`);
        result = data || [];
        await logAction("check_cowork_inbox", "success", { count: result.length });
        break;
      }

      case "get_api_spend": {
        let query = db()
          .from("api_spend")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        if (input.agent_name) query = query.eq("agent_name", input.agent_name);
        if (input.since) query = query.gte("created_at", input.since);

        const { data, error } = await query;
        if (error) throw new Error(`get_api_spend: ${error.message}`);

        // Aggregate by agent
        const byAgent = {};
        (data || []).forEach(row => {
          if (!byAgent[row.agent_name]) {
            byAgent[row.agent_name] = { total_cost: 0, total_input: 0, total_output: 0, runs: 0 };
          }
          byAgent[row.agent_name].total_cost += parseFloat(row.estimated_cost_usd || 0);
          byAgent[row.agent_name].total_input += row.input_tokens || 0;
          byAgent[row.agent_name].total_output += row.output_tokens || 0;
          byAgent[row.agent_name].runs += 1;
        });

        result = { raw: data, summary: byAgent };
        await logAction("get_api_spend", "success", { agents: Object.keys(byAgent).length });
        break;
      }

      case "get_lead_details": {
        // NOTE: lead_intelligence uses "lead_score" not "score"
        const { data, error } = await db()
          .from("lead_intelligence")
          .select("*")
          .gte("lead_score", input.min_score || 70)
          .order("lead_score", { ascending: false })
          .limit(input.limit || 10);
        if (error) throw new Error(`get_lead_details: ${error.message}`);
        result = data || [];
        await logAction("get_lead_details", "success", { count: result.length });
        break;
      }

      case "log_experiment": {
        // Uses shared_intelligence for experiment logging (prompt_experiments table has different schema)
        const { data: row, error } = await db().from("shared_intelligence").insert({
          source_agent: "orchestrator",
          intelligence_type: "experiment_result",
          title: `Experiment: ${input.experiment_name}`,
          insight: `Hypothesis: ${input.hypothesis}\nResult: ${input.result}\nLearning: ${input.learning}`,
          confidence: input.result === "success" ? 0.9 : input.result === "failure" ? 0.7 : 0.5,
          tags: ["experiment", input.result, input.agent || "orchestrator"],
          target_agents: ["orchestrator"],
          status: "active",
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90-day expiry for experiments
        }).select().single();
        if (error) throw new Error(`log_experiment: ${error.message}`);
        result = row;
        await logAction("log_experiment", "success", { name: input.experiment_name, result: input.result });
        break;
      }

      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { success: true, data: result };
  } catch (err) {
    await logAction(name, "error", { input }, err.message, Date.now() - start);
    return { success: false, error: err.message };
  }
}
