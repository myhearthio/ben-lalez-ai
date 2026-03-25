import { createClient } from "@supabase/supabase-js";

let _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

export async function logAction(action, status, payload = {}, error = null, durationMs = null) {
  await db().from("agent_logs").insert({ agent_name: "paid_ads", action, status, payload, error, duration_ms: durationMs });
}

export async function createNotification({ priority, title, message, data = {} }) {
  const { data: row, error } = await db().from("notification_queue").insert({
    source_agent: "paid_ads", notification_type: priority === "critical" ? "approval_required" : "report",
    priority, title, message, data, channel: "sms",
  }).select().single();
  if (error) { console.error("Notification failed:", error.message); return null; }
  return row;
}

export async function getAdCampaigns() {
  const { data } = await db().from("content_performance").select("*")
    .in("content_type", ["ad"]).in("channel", ["google_ads", "meta_ads"])
    .in("status", ["published", "paused"]).order("created_at", { ascending: false }).limit(50);
  return data || [];
}

export async function recordCampaign({ channel, title, externalId, campaignId, adSpend = 0, topics = [] }) {
  const { data } = await db().from("content_performance").insert({
    content_type: "ad", channel, title, body_preview: title,
    external_id: externalId, campaign_id: campaignId, ad_spend: adSpend,
    status: "published", published_at: new Date().toISOString(),
    created_by_agent: "paid_ads", topics,
  }).select().single();
  return data;
}

export async function updateCampaignMetrics(id, metrics) {
  await db().from("content_performance").update({
    impressions: metrics.impressions, clicks: metrics.clicks,
    ad_spend: metrics.spend, ad_conversions: metrics.conversions,
    cost_per_click: metrics.cpc, cost_per_lead: metrics.cpl,
    leads_generated: metrics.leads, metrics_updated_at: new Date().toISOString(),
    performance_score: metrics.performanceScore,
  }).eq("id", id);
}

export async function getRecentIntelligence() {
  const { data } = await db().from("shared_intelligence").select("*")
    .eq("status", "active").order("created_at", { ascending: false }).limit(10);
  return data || [];
}

export async function publishIntelligence({ title, insight, confidence, tags = [] }) {
  await db().from("shared_intelligence").insert({
    source_agent: "paid_ads", intelligence_type: "ad_performance",
    title, insight, confidence, tags, status: "active",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

export default db;
