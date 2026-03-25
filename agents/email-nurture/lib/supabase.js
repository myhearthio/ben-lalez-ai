import { createClient } from "@supabase/supabase-js";

let _supabase;
function db() {
  if (!_supabase) {
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

export async function logAction(action, status, payload = {}, error = null, durationMs = null, relatedId = null) {
  await db().from("agent_logs").insert({
    agent_name: "email_nurture",
    action, status, payload, error,
    duration_ms: durationMs,
    related_id: relatedId,
    related_type: relatedId ? "lead" : null,
  });
}

export async function getPendingNurtureTasks() {
  const { data } = await db().from("agent_tasks")
    .select("*")
    .eq("assigned_agent", "nurture_agent")
    .eq("status", "pending")
    .order("priority", { ascending: true })
    .limit(20);
  return data || [];
}

export async function claimTask(taskId) {
  const { error } = await db().from("agent_tasks").update({
    status: "in_progress", started_at: new Date().toISOString(),
  }).eq("id", taskId);
  return !error;
}

export async function completeTask(taskId, result) {
  await db().from("agent_tasks").update({
    status: "completed", completed_at: new Date().toISOString(), result,
  }).eq("id", taskId);
}

export async function failTask(taskId, errorMsg) {
  // Increment retry, fail if max
  const { data } = await db().from("agent_tasks").select("retry_count, max_retries").eq("id", taskId).single();
  const retries = (data?.retry_count || 0) + 1;
  const status = retries >= (data?.max_retries || 3) ? "failed" : "pending";
  await db().from("agent_tasks").update({ status, retry_count: retries, error: errorMsg }).eq("id", taskId);
}

export async function getLeadsNeedingNurture() {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db().from("lead_intelligence")
    .select("*")
    .in("stage", ["new", "nurturing"])
    .in("intent_level", ["warm", "cold", "unknown"])
    .or(`last_touch_at.is.null,last_touch_at.lt.${cutoff}`)
    .order("lead_score", { ascending: false })
    .limit(30);
  return data || [];
}

export async function getLeadById(leadId) {
  const { data } = await db().from("lead_intelligence").select("*").eq("id", leadId).single();
  return data;
}

export async function updateLeadTouch(leadId, touchType) {
  await db().from("lead_intelligence").update({
    last_touch_at: new Date().toISOString(),
    last_touch_type: touchType,
  }).eq("id", leadId);
}

export async function getBrandVoice() {
  const { data } = await db().from("brand_memory")
    .select("name, content, examples")
    .eq("status", "active")
    .in("category", ["voice", "rule", "template"])
    .limit(10);
  return data || [];
}

export async function recordContent(title, body, channel, externalId = null) {
  await db().from("content_performance").insert({
    content_type: "email_campaign", channel, title,
    body_preview: body.substring(0, 500),
    external_id: externalId,
    status: "published",
    published_at: new Date().toISOString(),
    created_by_agent: "email_nurture",
  });
}

export default db;
