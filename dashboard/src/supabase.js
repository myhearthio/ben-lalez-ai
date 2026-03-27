import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://zilgxvcrzlxuqcktemyl.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppbGd4dmNyemx4dXFja3RlbXlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjIxOTAsImV4cCI6MjA5MDAzODE5MH0.LeG5w1ho6gagyBwK4AY8mjvOLKFj5_LDpck8UWFkRnw";

export const supabase = createClient(supabaseUrl, supabaseKey);

// ── Agent health from agent_logs ──
export async function fetchAgentHealth() {
  const { data } = await supabase
    .from("agent_logs")
    .select("agent_name, action, status, created_at, duration_ms")
    .in("action", ["agent_run_complete", "agent_run_error"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (!data) return {};

  const health = {};
  for (const row of data) {
    if (!health[row.agent_name]) {
      health[row.agent_name] = { total: 0, successes: 0, errors: 0, lastActive: null, avgMs: 0, durations: [] };
    }
    const h = health[row.agent_name];
    h.total++;
    if (row.status === "success") h.successes++;
    if (row.status === "error") h.errors++;
    if (!h.lastActive) h.lastActive = row.created_at;
    if (row.duration_ms) h.durations.push(row.duration_ms);
  }

  for (const key of Object.keys(health)) {
    const h = health[key];
    h.rate = h.total > 0 ? ((h.successes / h.total) * 100).toFixed(1) : "0";
    h.avgMs = h.durations.length > 0 ? Math.round(h.durations.reduce((a, b) => a + b, 0) / h.durations.length) : 0;
  }

  return health;
}

// ── Notifications ──
export async function fetchNotifications(limit = 100) {
  const { data } = await supabase
    .from("notification_queue")
    .select("id, source_agent, notification_type, priority, title, message, status, channel, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

// ── Tasks ──
export async function fetchAgentTasks() {
  const { data } = await supabase
    .from("agent_tasks")
    .select("id, assigned_agent, task_type, description, status, priority, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return data || [];
}

// ── Team ──
export async function fetchTeamMembers() {
  const { data } = await supabase
    .from("team_members")
    .select("name, role, ytd_closings, ytd_volume, active_listings, active")
    .eq("active", true)
    .order("name");
  return data || [];
}

// ── Spend ──
export async function fetchApiSpend() {
  const { data } = await supabase
    .from("api_spend")
    .select("agent_name, model, input_tokens, output_tokens, estimated_cost_usd, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return data || [];
}

// ── Save chat message ──
export async function saveConversation(sender, agent, role, message) {
  try {
    await supabase.from("dashboard_conversations").insert({ sender, agent, role, message });
  } catch (e) {
    // silent fail — non-critical
  }
}
