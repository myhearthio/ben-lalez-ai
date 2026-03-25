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
    agent_name: "lead_scoring",
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
    source_agent: "lead_scoring",
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

export async function getUnscoredLeads() {
  const { data, error } = await db()
    .from("lead_intelligence")
    .select("*")
    .or("lead_score.is.null,lead_score.eq.0")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to fetch unscored leads:", error.message);
    return [];
  }
  return data || [];
}

export async function getLeadsForRescoring(olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await db()
    .from("lead_intelligence")
    .select("*")
    .gt("lead_score", 0)
    .lt("updated_at", cutoff)
    .in("stage", ["new", "nurturing", "active"])
    .order("lead_score", { ascending: false })
    .limit(25);

  if (error) {
    console.error("Failed to fetch leads for rescoring:", error.message);
    return [];
  }
  return data || [];
}

export async function updateLeadScore(leadId, score, intentLevel, predictedTimeline, aiNotes) {
  const { error } = await db()
    .from("lead_intelligence")
    .update({
      lead_score: score,
      intent_level: intentLevel,
      predicted_timeline: predictedTimeline,
      ai_notes: aiNotes,
    })
    .eq("id", leadId);

  if (error) {
    console.error(`Failed to update lead ${leadId}:`, error.message);
    return false;
  }
  return true;
}

export async function insertTestLead(lead) {
  const { data, error } = await db()
    .from("lead_intelligence")
    .insert(lead)
    .select()
    .single();

  if (error) {
    console.error("Failed to insert test lead:", error.message);
    return null;
  }
  return data;
}

export async function publishIntelligence({ title, insight, intelligenceType, confidence, tags = [] }) {
  const { error } = await db().from("shared_intelligence").insert({
    source_agent: "lead_scoring",
    intelligence_type: intelligenceType,
    title,
    insight,
    confidence,
    tags,
    status: "active",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) console.error("Failed to publish intelligence:", error.message);
}

export default db;
