import { createClient } from "@supabase/supabase-js";

let _supabase;
function getClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

export async function logAction(action, status, payload = {}, error = null, durationMs = null, relatedId = null, relatedType = null) {
  const { error: insertError } = await getClient().from("agent_logs").insert({
    agent_name: "gmb_agent",
    action,
    status,
    payload,
    error,
    duration_ms: durationMs,
    related_id: relatedId,
    related_type: relatedType,
  });

  if (insertError) {
    console.error(`Failed to log action "${action}":`, insertError.message);
  }
}

export async function createNotification({ notificationType, priority, title, message, data = {}, channel = "sms", relatedId = null, relatedType = null, expiresAt = null, autoAction = null }) {
  const { data: row, error } = await getClient().from("notification_queue").insert({
    source_agent: "gmb_agent",
    notification_type: notificationType,
    priority,
    title,
    message,
    data,
    channel,
    related_id: relatedId,
    related_type: relatedType,
    expires_at: expiresAt,
    auto_action: autoAction,
  }).select().single();

  if (error) {
    console.error("Failed to create notification:", error.message);
    return null;
  }
  return row;
}

export async function getBrandVoice() {
  const { data, error } = await getClient()
    .from("brand_memory")
    .select("name, content, examples")
    .eq("status", "active")
    .in("category", ["voice", "rule"])
    .order("avg_performance", { ascending: false, nullsFirst: false })
    .limit(10);

  if (error) {
    console.error("Failed to fetch brand voice:", error.message);
    return [];
  }
  return data || [];
}

export async function getLastReviewCheckTime(platform) {
  const { data } = await getClient()
    .from("agent_logs")
    .select("created_at")
    .eq("agent_name", "gmb_agent")
    .eq("action", `check_${platform}_reviews`)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1);

  return data?.[0]?.created_at || null;
}

export async function getLastGmbPostTime() {
  const { data } = await getClient()
    .from("content_performance")
    .select("published_at")
    .eq("created_by_agent", "gmb_agent")
    .eq("content_type", "gmb_post")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1);

  return data?.[0]?.published_at || null;
}

export async function getGmbPostsThisWeek() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const { count } = await getClient()
    .from("content_performance")
    .select("id", { count: "exact", head: true })
    .eq("created_by_agent", "gmb_agent")
    .eq("content_type", "gmb_post")
    .eq("status", "published")
    .gte("published_at", monday.toISOString());

  return count || 0;
}

export async function recordGmbPost(title, body, externalId, externalUrl) {
  const { data, error } = await getClient().from("content_performance").insert({
    content_type: "gmb_post",
    channel: "gmb",
    title,
    body_preview: body.substring(0, 500),
    external_id: externalId,
    external_url: externalUrl,
    status: "published",
    published_at: new Date().toISOString(),
    created_by_agent: "gmb_agent",
  }).select().single();

  if (error) {
    console.error("Failed to record GMB post:", error.message);
    return null;
  }
  return data;
}

export async function getRecentIntelligence() {
  const { data, error } = await getClient()
    .from("shared_intelligence")
    .select("title, insight, intelligence_type, neighborhoods, tags")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) return [];
  return data || [];
}

export default getClient;
