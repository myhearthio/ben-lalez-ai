import { createClient } from "@supabase/supabase-js";

let _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

export async function logAction(action, status, payload = {}, error = null, durationMs = null) {
  await db().from("agent_logs").insert({ agent_name: "intelligence", action, status, payload, error, duration_ms: durationMs });
}

export async function publishIntelligence({ intelligenceType, title, insight, data = {}, confidence, targetAgents = null, neighborhoods = null, tags = [] }) {
  const { data: row, error } = await db().from("shared_intelligence").insert({
    source_agent: "intelligence", intelligence_type: intelligenceType,
    title, insight, data, confidence, target_agents: targetAgents,
    neighborhoods, tags, status: "active",
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  }).select().single();
  if (error) console.error("Publish failed:", error.message);
  return row;
}

export async function getRecentIntelligence(limit = 20) {
  const { data } = await db().from("shared_intelligence").select("*")
    .eq("status", "active").order("created_at", { ascending: false }).limit(limit);
  return data || [];
}

export async function getLeadSourceStats() {
  const { data } = await db().from("lead_intelligence")
    .select("source, stage, lead_score, closing_value");
  return data || [];
}

export async function expireOldIntelligence() {
  const { count } = await db().from("shared_intelligence")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString())
    .select("id", { count: "exact", head: true });
  return count || 0;
}

export default db;
