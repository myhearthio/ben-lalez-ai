// PRESTON v1.0 — lib/supabase.js
// PR & Earned Media Agent — database functions
// Tables: pr_targets, pr_outreach, backlink_tracking + shared tables

import { createClient } from "@supabase/supabase-js";

let _supabase;
function db() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

// ============================================
// LOGGING
// ============================================

export async function logAction(action, status, payload = {}, error = null, durationMs = null) {
  await db().from("agent_logs").insert({ agent_name: "preston_pr", action, status, payload, error, duration_ms: durationMs });
}

// ============================================
// PR TARGETS — journalist/publication management
// ============================================

export async function getPrTargets({ tier, status, beat, limit = 50 } = {}) {
  let query = db()
    .from("pr_targets")
    .select("*")
    .order("domain_rating", { ascending: false })
    .limit(limit);

  if (tier) query = query.eq("publication_tier", tier);
  if (status) query = query.eq("status", status);
  if (beat) query = query.ilike("beat", `%${beat}%`);

  const { data, error } = await query;
  if (error) throw new Error(`getPrTargets: ${error.message}`);
  return data || [];
}

export async function createPrTarget({ contactName, contactEmail, contactTitle, publication, publicationUrl, publicationTier, domainRating, beat, source, tags = [] }) {
  const { data, error } = await db().from("pr_targets").insert({
    contact_name: contactName,
    contact_email: contactEmail,
    contact_title: contactTitle,
    publication,
    publication_url: publicationUrl,
    publication_tier: publicationTier,
    domain_rating: domainRating,
    beat,
    source,
    tags,
  }).select().single();
  if (error) throw new Error(`createPrTarget: ${error.message}`);
  return data;
}

export async function updatePrTarget(id, updates) {
  updates.updated_at = new Date().toISOString();
  const { data, error } = await db().from("pr_targets").update(updates).eq("id", id).select().single();
  if (error) throw new Error(`updatePrTarget: ${error.message}`);
  return data;
}

// ============================================
// PR OUTREACH — pitch tracking and workflow
// ============================================

export async function createOutreach({ campaignName, outreachType, targetId, publication, journalistName, subjectLine, pitchBody, pitchAngle, dataPoints = {}, intelligenceSourceId, priority = "normal", tags = [] }) {
  const { data, error } = await db().from("pr_outreach").insert({
    campaign_name: campaignName,
    outreach_type: outreachType,
    target_id: targetId,
    publication,
    journalist_name: journalistName,
    subject_line: subjectLine,
    pitch_body: pitchBody,
    pitch_angle: pitchAngle,
    data_points: dataPoints,
    intelligence_source_id: intelligenceSourceId,
    priority,
    tags,
    status: "drafted",
  }).select().single();
  if (error) throw new Error(`createOutreach: ${error.message}`);
  return data;
}

export async function getOutreachPipeline({ status, outreachType, limit = 30 } = {}) {
  let query = db()
    .from("pr_outreach")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (outreachType) query = query.eq("outreach_type", outreachType);

  const { data, error } = await query;
  if (error) throw new Error(`getOutreachPipeline: ${error.message}`);
  return data || [];
}

export async function updateOutreachStatus(id, { status, sentAt, placedAt, placementUrl, placementDomainRating, backlinkEarned, responseSummary, followUpCount, nextFollowUpAt }) {
  const updates = { status, updated_at: new Date().toISOString() };
  if (sentAt) updates.sent_at = sentAt;
  if (placedAt) updates.placed_at = placedAt;
  if (placementUrl) updates.placement_url = placementUrl;
  if (placementDomainRating) updates.placement_domain_rating = placementDomainRating;
  if (backlinkEarned !== undefined) updates.backlink_earned = backlinkEarned;
  if (responseSummary) updates.response_summary = responseSummary;
  if (followUpCount !== undefined) updates.follow_up_count = followUpCount;
  if (nextFollowUpAt) updates.next_follow_up_at = nextFollowUpAt;

  const { data, error } = await db().from("pr_outreach").update(updates).eq("id", id).select().single();
  if (error) throw new Error(`updateOutreachStatus: ${error.message}`);
  return data;
}

export async function getOverdueFollowUps() {
  const { data, error } = await db()
    .from("pr_outreach")
    .select("*")
    .in("status", ["sent", "followed_up"])
    .lt("next_follow_up_at", new Date().toISOString())
    .order("next_follow_up_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(`getOverdueFollowUps: ${error.message}`);
  return data || [];
}

// ============================================
// BACKLINK TRACKING
// ============================================

export async function logBacklink({ sourceUrl, sourceDomain, sourceDomainRating, sourcePageTitle, targetUrl, anchorText, discoveryMethod, outreachId, estimatedTraffic, tags = [] }) {
  const { data, error } = await db().from("backlink_tracking").insert({
    source_url: sourceUrl,
    source_domain: sourceDomain,
    source_domain_rating: sourceDomainRating,
    source_page_title: sourcePageTitle,
    target_url: targetUrl,
    anchor_text: anchorText,
    discovery_method: discoveryMethod,
    outreach_id: outreachId,
    estimated_traffic: estimatedTraffic,
    tags,
  }).select().single();
  if (error) throw new Error(`logBacklink: ${error.message}`);
  return data;
}

export async function getBacklinks({ status, minDr, limit = 50 } = {}) {
  let query = db()
    .from("backlink_tracking")
    .select("*")
    .order("source_domain_rating", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (minDr) query = query.gte("source_domain_rating", minDr);

  const { data, error } = await query;
  if (error) throw new Error(`getBacklinks: ${error.message}`);
  return data || [];
}

export async function getBacklinkStats() {
  const { data: active } = await db().from("backlink_tracking").select("id, source_domain_rating", { count: "exact" }).eq("status", "active");
  const total = active?.length || 0;
  const highDr = (active || []).filter(b => b.source_domain_rating >= 50).length;
  const avgDr = total > 0 ? Math.round((active || []).reduce((sum, b) => sum + (b.source_domain_rating || 0), 0) / total) : 0;
  return { total_active_backlinks: total, high_dr_backlinks: highDr, average_domain_rating: avgDr };
}

// ============================================
// SHARED — cross-agent intelligence
// ============================================

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

export async function publishIntelligence({ intelligenceType, title, insight, data = {}, confidence, targetAgents = null, neighborhoods = null, tags = [] }) {
  const { data: row, error } = await db().from("shared_intelligence").insert({
    source_agent: "preston_pr", intelligence_type: intelligenceType,
    title, insight, data, confidence, target_agents: targetAgents,
    neighborhoods, tags, status: "active",
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30-day expiry for PR intelligence
  }).select().single();
  if (error) console.error("Publish failed:", error.message);
  return row;
}

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

export async function getRecentPublishedContent(limit = 10) {
  const { data } = await db().from("content_performance")
    .select("title, content_type, channel, topics, published_at, external_url, performance_score")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  return data || [];
}

export default db;
