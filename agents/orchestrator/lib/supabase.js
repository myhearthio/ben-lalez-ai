// OLIVER v2.0 — lib/supabase.js
// COMPLETE DROP-IN REPLACEMENT for agents/orchestrator/lib/supabase.js
// Changes: Added readSharedIntelligence, getBrandMemory, getContentCalendar. All existing functions preserved.

import { createClient } from "@supabase/supabase-js";

let _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

// ============================================
// EXISTING FUNCTIONS (preserved exactly)
// ============================================

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

// ============================================
// NEW v2.0 FUNCTIONS
// ============================================

/**
 * Read shared intelligence with filters — Oliver needs to check what Roger published
 * that Content/Ads should act on, and monitor cross-agent intelligence flow.
 */
export async function readSharedIntelligence({ sourceAgent, intelligenceType, tags, since, limit = 20 } = {}) {
  let query = db()
    .from("shared_intelligence")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (sourceAgent) query = query.eq("source_agent", sourceAgent);
  if (intelligenceType) query = query.eq("intelligence_type", intelligenceType);
  if (tags && tags.length > 0) query = query.overlaps("tags", tags);
  if (since) query = query.gte("created_at", since);

  const { data, error } = await query;
  if (error) throw new Error(`readSharedIntelligence: ${error.message}`);
  return data || [];
}

/**
 * Read brand memory — Oliver uses this for brand governance,
 * verifying content matches voice rules and flagging violations.
 */
export async function getBrandMemory({ category } = {}) {
  let query = db()
    .from("brand_memory")
    .select("*")
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) throw new Error(`getBrandMemory: ${error.message}`);
  return data || [];
}

/**
 * Read content calendar — Oliver checks planned vs. actual content execution.
 * This is DIFFERENT from getContentStats which reads content_performance (published content).
 * content_calendar = the plan. content_performance = the execution.
 */
export async function getContentCalendar({ status, assignedAgent, startDate, endDate, limit = 50 } = {}) {
  let query = db()
    .from("content_calendar")
    .select("*")
    .order("publish_date", { ascending: true })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (assignedAgent) query = query.eq("assigned_agent", assignedAgent);
  if (startDate) query = query.gte("publish_date", startDate);
  if (endDate) query = query.lte("publish_date", endDate);

  const { data, error } = await query;
  if (error) throw new Error(`getContentCalendar: ${error.message}`);
  return data || [];
}

export default db;
