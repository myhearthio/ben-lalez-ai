// SARAH v2.0 — lib/supabase.js
// COMPLETE DROP-IN REPLACEMENT for agents/content-seo/lib/supabase.js
// Changes: Added readSharedIntelligence, getContentCalendar, updateContentCalendar.
// FIXED publishIntelligence to include ALL fields (data, targetAgents, neighborhoods were missing).
// All existing functions preserved.

import { createClient } from "@supabase/supabase-js";

let _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

// ============================================
// EXISTING FUNCTIONS (preserved exactly, except publishIntelligence which is FIXED)
// ============================================

export async function logAction(action, status, payload = {}, error = null, durationMs = null) {
  await db().from("agent_logs").insert({
    agent_name: "content_seo", action, status, payload, error, duration_ms: durationMs,
  });
}

export async function getBrandVoice() {
  const { data } = await db().from("brand_memory").select("name, content, examples")
    .eq("status", "active").in("category", ["voice", "rule", "template", "keyword"]).limit(15);
  return data || [];
}

export async function getRecentIntelligence() {
  const { data } = await db().from("shared_intelligence").select("*")
    .eq("status", "active").order("created_at", { ascending: false }).limit(10);
  return data || [];
}

export async function getRecentContent(limit = 10) {
  const { data } = await db().from("content_performance").select("title, content_type, channel, topics, published_at, performance_score")
    .eq("created_by_agent", "content_seo").eq("status", "published")
    .order("published_at", { ascending: false }).limit(limit);
  return data || [];
}

export async function getContentThisWeek() {
  const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0,0,0,0);
  const { count } = await db().from("content_performance").select("id", { count: "exact", head: true })
    .eq("created_by_agent", "content_seo").eq("status", "published").gte("published_at", monday.toISOString());
  return count || 0;
}

export async function recordContent({ contentType, channel, title, body, externalId, externalUrl, topics = [] }) {
  const { data, error } = await db().from("content_performance").insert({
    content_type: contentType, channel, title, body_preview: body.substring(0, 500),
    external_id: externalId, external_url: externalUrl, topics,
    status: "published", published_at: new Date().toISOString(), created_by_agent: "content_seo",
  }).select().single();
  if (error) console.error("Record content failed:", error.message);
  return data;
}

/**
 * FIXED: v1.0 was missing data, targetAgents, and neighborhoods fields.
 * The filming brief tool and other tools need these fields.
 */
export async function publishIntelligence({ intelligenceType, title, insight, data = {}, confidence, targetAgents = null, neighborhoods = null, tags = [] } = {}) {
  const { data: row, error } = await db().from("shared_intelligence").insert({
    source_agent: "content_seo",
    intelligence_type: intelligenceType || "content_insight",
    title, insight, data, confidence,
    target_agents: targetAgents,
    neighborhoods,
    tags, status: "active",
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  }).select().single();
  if (error) console.error("Publish failed:", error.message);
  return row;
}

// ============================================
// NEW v2.0 FUNCTIONS
// ============================================

/**
 * Read shared intelligence with filters — Sarah needs Roger's market intelligence
 * for timely content angles, especially high-confidence insights.
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
 * Read content calendar — Sarah checks what's scheduled, what's overdue,
 * and tracks execution against the plan.
 * NOTE: content_calendar uses "headline" (not title) and "publish_date".
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

/**
 * Update content calendar item — mark as published, update status, add URL.
 * NOTE: content_calendar uses "published_url" (not "external_url").
 */
export async function updateContentCalendar({ id, status, externalUrl } = {}) {
  const updates = { status };
  if (externalUrl) updates.published_url = externalUrl;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await db()
    .from("content_calendar")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateContentCalendar: ${error.message}`);
  return data;
}

/**
 * Read brand memory with full fields — broader than getBrandVoice.
 * Used for Content Matrix decisions and brand governance checks.
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
