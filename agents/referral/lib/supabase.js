import { createClient } from "@supabase/supabase-js";

let _supabase;
function db() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

export async function logAction(action, status, payload = {}, error = null, durationMs = null, relatedId = null) {
  const { error: err } = await db().from("agent_logs").insert({
    agent_name: "referral_agent",
    action,
    status,
    payload,
    error,
    duration_ms: durationMs,
    related_id: relatedId,
    related_type: relatedId ? "lead" : null,
  });
  if (err) console.error(`Log failed "${action}":`, err.message);
}

export async function createNotification({ priority, title, message, data = {}, relatedId = null }) {
  const { data: row, error } = await db().from("notification_queue").insert({
    source_agent: "referral_agent",
    notification_type: priority === "critical" ? "alert" : "report",
    priority,
    title,
    message,
    data,
    channel: "sms",
    related_id: relatedId,
    related_type: relatedId ? "lead" : null,
  }).select().single();

  if (error) {
    console.error("Notification failed:", error.message);
    return null;
  }
  return row;
}

export async function getClosedLeads() {
  const { data, error } = await db()
    .from("lead_intelligence")
    .select("*")
    .eq("stage", "closed")
    .order("closed_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to fetch closed leads:", error.message);
    return [];
  }
  return data || [];
}

export async function getReferralCandidates() {
  // Closed leads who haven't been touched in 30+ days — ripe for referral ask
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db()
    .from("lead_intelligence")
    .select("*")
    .eq("stage", "closed")
    .lt("last_touch_at", cutoff)
    .order("closing_value", { ascending: false })
    .limit(25);

  if (error) {
    console.error("Failed to fetch referral candidates:", error.message);
    return [];
  }
  return data || [];
}

export async function getAnniversaryClients() {
  // Clients whose closing anniversary is within the next 14 days
  const now = new Date();
  const { data, error } = await db()
    .from("lead_intelligence")
    .select("*")
    .eq("stage", "closed")
    .not("closed_at", "is", null);

  if (error) {
    console.error("Failed to fetch anniversary clients:", error.message);
    return [];
  }

  return (data || []).filter((lead) => {
    if (!lead.closed_at) return false;
    const closedDate = new Date(lead.closed_at);
    const thisYearAnniversary = new Date(now.getFullYear(), closedDate.getMonth(), closedDate.getDate());
    const diff = (thisYearAnniversary - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 14;
  });
}

export async function getHighValueLeads() {
  // Active leads with high scores that came from referrals
  const { data, error } = await db()
    .from("lead_intelligence")
    .select("*")
    .eq("source", "referral")
    .in("stage", ["new", "nurturing", "active"])
    .order("lead_score", { ascending: false })
    .limit(20);

  if (error) return [];
  return data || [];
}

export async function updateLeadTouch(leadId) {
  const { error } = await db()
    .from("lead_intelligence")
    .update({
      last_touch_at: new Date().toISOString(),
      last_touch_type: "email",
      total_touches: db().rpc ? undefined : undefined,
    })
    .eq("id", leadId);

  if (error) console.error(`Failed to update touch for ${leadId}:`, error.message);
}

export async function publishIntelligence({ title, insight, intelligenceType, confidence, tags = [] }) {
  const { error } = await db().from("shared_intelligence").insert({
    source_agent: "referral_agent",
    intelligence_type: intelligenceType,
    title,
    insight,
    confidence,
    tags,
    status: "active",
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) console.error("Failed to publish intelligence:", error.message);
}

export async function createAgentTask({ assignedAgent, taskType, description, payload = {}, priority = 5 }) {
  const { data, error } = await db().from("agent_tasks").insert({
    assigned_agent: assignedAgent,
    created_by: "referral_agent",
    task_type: taskType,
    description,
    payload,
    priority,
    status: "pending",
  }).select().single();

  if (error) {
    console.error("Failed to create agent task:", error.message);
    return null;
  }
  return data;
}

export default db;
