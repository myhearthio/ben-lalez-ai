import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://zilgxvcrzlxuqcktemyl.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppbGd4dmNyemx4dXFja3RlbXlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjIxOTAsImV4cCI6MjA5MDAzODE5MH0.LeG5w1ho6gagyBwK4AY8mjvOLKFj5_LDpck8UWFkRnw";

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function fetchAgentStatus() {
    const { data } = await supabase.from("agent_logs")
      .select("agent_name, action, status, created_at, duration_ms")
      .in("action", ["agent_run_complete", "agent_run_error"])
      .order("created_at", { ascending: false })
      .limit(50);
    return data || [];
}

export async function fetchKPIs() {
    const [leads, content, notifications] = await Promise.all([
          supabase.from("lead_intelligence").select("stage, lead_score, intent_level, source, closing_value"),
          supabase.from("content_performance").select("content_type, channel, status, published_at, performance_score, ad_spend, leads_generated").eq("status", "published"),
          supabase.from("notification_queue").select("id, source_agent, priority, title, status, created_at").order("created_at", { ascending: false }).limit(20),
        ]);
    return {
          leads: leads.data || [],
          content: content.data || [],
          notifications: notifications.data || [],
    };
}

export async function fetchRecentLogs(limit = 30) {
    const { data } = await supabase.from("agent_logs")
      .select("agent_name, action, status, payload, error, created_at, duration_ms")
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
}

export async function fetchContentFeed() {
    const { data } = await supabase.from("content_performance")
      .select("title, content_type, channel, status, published_at, performance_score, created_by_agent, external_url")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(20);
    return data || [];
}
