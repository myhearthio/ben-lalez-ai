import { createClient } from "@supabase/supabase-js";

let _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

export async function logAction(action, status, payload = {}, error = null, durationMs = null) {
  await db().from("agent_logs").insert({ agent_name: "orchestrator", action, status, payload, error, duration_ms: durationMs });
}

export async function createNotification({ priority, title, message, data = {} }) {
  const { data: row } = await db().from("notification_queue").insert({
    source_agent: "orchestrator", notification_type: priority === "critical" ? "alert" : "report",
    priority, title, message, data, channel: "sms",
  }).select().single();
  return row;
}

export async function getAgentHealth() {
  // Get last run time for each agent
  const { data } = await db().from("agent_logs")
    .select("agent_name, action, status, created_at, duration_ms")
    .in("action", ["agent_run_complete", "agent_run_start", "agent_run_error"])
    .order("created_at", { ascending: false })
    .limit(100);
  return data || [];
}

export async function getAgentErrors(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data } = await db().from("agent_logs")
    .select("*").eq("status", "error").gte("created_at", since)
    .order("created_at", { ascending: false }).limit(50);
  return data || [];
}

export async function getPendingTasks() {
  const { data } = await db().from("agent_tasks").select("*")
    .eq("status", "pending").order("priority", { ascending: true }).limit(30);
  return data || [];
}

export async function getFailedTasks() {
  const { data } = await db().from("agent_tasks").select("*")
    .eq("status", "failed").order("created_at", { ascending: false }).limit(20);
  return data || [];
}

export async function getStuckTasks(hours = 2) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data } = await db().from("agent_tasks").select("*")
    .eq("status", "in_progress").lt("started_at", cutoff).limit(20);
  return data || [];
}

export async function resetTask(taskId) {
  await db().from("agent_tasks").update({ status: "pending", started_at: null, error: null }).eq("id", taskId);
}

export async function createAgentTask({ assignedAgent, taskType, description, payload = {}, priority = 5 }) {
  const { data } = await db().from("agent_tasks").insert({
    assigned_agent: assignedAgent, created_by: "orchestrator",
    task_type: taskType, description, payload, priority, status: "pending",
  }).select().single();
  return data;
}

export async function getPendingNotifications() {
  const { data } = await db().from("notification_queue").select("*")
    .eq("status", "pending").order("created_at", { ascending: false }).limit(20);
  return data || [];
}

export async function getPipelineStats() {
  const { data } = await db().from("lead_intelligence")
    .select("stage, intent_level, lead_score, source, closing_value");
  return data || [];
}

export async function getContentStats() {
  const now = new Date();
  const weekAgo = new Date(now - 7 * 86400000).toISOString();
  const { data } = await db().from("content_performance").select("content_type, channel, status, performance_score, published_at")
    .gte("published_at", weekAgo);
  return data || [];
}

export async function getActiveIntelligence() {
  const { data } = await db().from("shared_intelligence").select("source_agent, intelligence_type, title, confidence, action_count, created_at")
    .eq("status", "active").order("created_at", { ascending: false }).limit(20);
  return data || [];
}

export default db;
