import { createClient } from "@supabase/supabase-js";

let _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

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

export async function publishIntelligence({ title, insight, confidence, tags = [] }) {
  await db().from("shared_intelligence").insert({
    source_agent: "content_seo", intelligence_type: "content_insight",
    title, insight, confidence, tags, status: "active",
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

export default db;
