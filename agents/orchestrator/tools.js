import { logAction, createNotification, getAgentHealth, getAgentErrors, getPendingTasks, getFailedTasks, getStuckTasks, resetTask, createAgentTask, getPendingNotifications, getPipelineStats, getContentStats, getActiveIntelligence } from "./lib/supabase.js";

export const toolDefinitions = [
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
        assignedAgent: { type: "string", enum: ["lead_scoring", "nurture_agent", "content_seo", "paid_ads", "gmb_agent", "referral_agent", "intelligence", "email_nurture"] },
        taskType: { type: "string" }, description: { type: "string" },
        payload: { type: "object" }, priority: { type: "number" },
      },
      required: ["assignedAgent", "taskType", "description"],
    },
  },
  { name: "get_pipeline_stats", description: "Get lead pipeline statistics — counts by stage, intent, source.", input_schema: { type: "object", properties: {} } },
  { name: "get_content_stats", description: "Get content published in the last 7 days across all channels.", input_schema: { type: "object", properties: {} } },
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
];

export async function executeTool(name, input) {
  const start = Date.now();
  try {
    let result;
    switch (name) {
      case "get_agent_health": result = await getAgentHealth(); await logAction("get_agent_health", "success", { count: result.length }); break;
      case "get_agent_errors": result = await getAgentErrors(input.hours || 24); await logAction("get_agent_errors", "success", { count: result.length }); break;
      case "get_pending_tasks": result = await getPendingTasks(); break;
      case "get_failed_tasks": result = await getFailedTasks(); break;
      case "get_stuck_tasks": result = await getStuckTasks(); break;
      case "reset_stuck_task": await resetTask(input.taskId); await logAction("reset_stuck_task", "success", { taskId: input.taskId }); result = { reset: true }; break;
      case "create_task":
        result = await createAgentTask({ assignedAgent: input.assignedAgent, taskType: input.taskType, description: input.description, payload: input.payload || {}, priority: input.priority || 5 });
        await logAction("create_task", "success", { assignedAgent: input.assignedAgent, taskType: input.taskType });
        break;
      case "get_pipeline_stats": result = await getPipelineStats(); break;
      case "get_content_stats": result = await getContentStats(); break;
      case "get_active_intelligence": result = await getActiveIntelligence(); break;
      case "get_pending_notifications": result = await getPendingNotifications(); break;
      case "send_daily_report":
        const report = await createNotification({ priority: "normal", title: input.title, message: input.report, data: { type: "daily_report" } });
        await logAction("send_daily_report", "success", { notificationId: report?.id });
        result = { sent: true, notificationId: report?.id };
        break;
      case "alert_ben":
        const alert = await createNotification({ priority: input.priority || "high", title: input.title, message: input.message });
        await logAction("alert_ben", "success", { notificationId: alert?.id, priority: input.priority });
        result = { sent: true, notificationId: alert?.id };
        break;
      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { success: true, data: result };
  } catch (err) {
    await logAction(name, "error", { input }, err.message, Date.now() - start);
    return { success: false, error: err.message };
  }
}
