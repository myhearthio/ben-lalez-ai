// ROGER v2.0 — lib/supabase.js
// COMPLETE DROP-IN REPLACEMENT for agents/intelligence/lib/supabase.js
// Changes: Added readSharedIntelligence, getBrandMemory. All existing functions preserved.

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

// ============================================
// NEW v2.0 FUNCTIONS
// ============================================

/**
 * Read shared intelligence with filters — lets Roger read what ALL agents have published,
 * not just his own recent output. Essential for cross-agent awareness.
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
 * Read brand memory — voice rules, approved/rejected phrases, audience definitions.
 * Roger uses this to understand Ben's positioning when analyzing competitors.
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

export default db;
