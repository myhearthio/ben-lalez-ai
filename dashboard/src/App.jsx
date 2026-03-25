import React, { useState, useEffect, useCallback } from "react";
import { fetchAgentStatus, fetchKPIs, fetchRecentLogs, fetchContentFeed } from "./supabase.js";

const AGENTS = [
  { key: "orchestrator", name: "Orchestrator", schedule: "30min" },
  { key: "lead_scoring", name: "Lead Scoring", schedule: "15min" },
  { key: "referral_agent", name: "Referral", schedule: "12h" },
  { key: "email_nurture", name: "Email Nurture", schedule: "10min" },
  { key: "content_seo", name: "Content SEO", schedule: "4h" },
  { key: "paid_ads", name: "Paid Ads", schedule: "4h" },
  { key: "gmb_agent", name: "GMB/Reviews", schedule: "2h" },
  { key: "intelligence", name: "Intelligence", schedule: "6h" },
];

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusDot({ status }) {
  const color = status === "healthy" ? "#22c55e" : status === "warning" ? "#eab308" : status === "error" ? "#ef4444" : "#6b7280";
  return <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", backgroundColor: color, marginRight: 8 }} />;
}

function Card({ title, children, style }) {
  return (
    <div style={{ background: "#1e1e2e", borderRadius: 12, padding: 16, marginBottom: 16, ...style }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>{title}</h3>
      {children}
    </div>
  );
}

function KPIBox({ label, value, sub }) {
  return (
    <div style={{ textAlign: "center", flex: 1, minWidth: 80 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#e2e8f0" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function App() {
  const [agentLogs, setAgentLogs] = useState([]);
  const [kpis, setKpis] = useState({ leads: [], content: [], notifications: [] });
  const [logs, setLogs] = useState([]);
  const [contentFeed, setContentFeed] = useState([]);
  const [tab, setTab] = useState("overview");

  const refresh = useCallback(async () => {
    const [status, kpiData, recentLogs, feed] = await Promise.all([
      fetchAgentStatus(), fetchKPIs(), fetchRecentLogs(), fetchContentFeed(),
    ]);
    setAgentLogs(status);
    setKpis(kpiData);
    setLogs(recentLogs);
    setContentFeed(feed);
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 30000); return () => clearInterval(id); }, [refresh]);

  // Compute agent status
  const agentStatus = AGENTS.map((agent) => {
    const agentRuns = agentLogs.filter((l) => l.agent_name === agent.key);
    const lastRun = agentRuns[0];
    const errors = agentRuns.filter((l) => l.status === "error").length;
    let health = "unknown";
    if (lastRun) {
      const minsAgo = (Date.now() - new Date(lastRun.created_at).getTime()) / 60000;
      health = lastRun.status === "error" ? "error" : minsAgo > 60 * 24 ? "warning" : "healthy";
    }
    return { ...agent, lastRun, errors, health };
  });

  // KPI calculations
  const totalLeads = kpis.leads.length;
  const hotLeads = kpis.leads.filter((l) => l.intent_level === "hot").length;
  const closings = kpis.leads.filter((l) => l.stage === "closed").length;
  const totalContent = kpis.content.length;
  const pendingNotifs = kpis.notifications.filter((n) => n.status === "pending").length;
  const totalAdSpend = kpis.content.reduce((s, c) => s + (parseFloat(c.ad_spend) || 0), 0);

  const tabStyle = (t) => ({
    padding: "8px 16px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
    background: tab === t ? "#3b82f6" : "transparent", color: tab === t ? "#fff" : "#94a3b8",
  });

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#0f0f1a", color: "#e2e8f0", minHeight: "100vh", padding: "16px", maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Ben Lalez AI Marketing OS</h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>Compass Chicago | 8 Agents Running 24/7</p>
        </div>
        <button onClick={refresh} style={{ background: "#1e1e2e", border: "1px solid #334155", borderRadius: 8, color: "#94a3b8", padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>Refresh</button>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto" }}>
        <button style={tabStyle("overview")} onClick={() => setTab("overview")}>Overview</button>
        <button style={tabStyle("agents")} onClick={() => setTab("agents")}>Agents</button>
        <button style={tabStyle("notifications")} onClick={() => setTab("notifications")}>Notifications</button>
        <button style={tabStyle("content")} onClick={() => setTab("content")}>Content</button>
        <button style={tabStyle("logs")} onClick={() => setTab("logs")}>Logs</button>
      </div>

      {tab === "overview" && (
        <>
          <Card title="Key Metrics">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <KPIBox label="Total Leads" value={totalLeads} />
              <KPIBox label="Hot Leads" value={hotLeads} />
              <KPIBox label="Closings" value={closings} />
              <KPIBox label="Content" value={totalContent} sub="published" />
              <KPIBox label="Ad Spend" value={`$${totalAdSpend.toFixed(0)}`} />
              <KPIBox label="Pending" value={pendingNotifs} sub="notifications" />
            </div>
          </Card>

          <Card title="Agent Status">
            {agentStatus.map((a) => (
              <div key={a.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1a1a2e" }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <StatusDot status={a.health} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {a.lastRun ? timeAgo(a.lastRun.created_at) : "never"}
                  <span style={{ marginLeft: 8, color: "#475569" }}>({a.schedule})</span>
                </div>
              </div>
            ))}
          </Card>

          <Card title="Recent Notifications">
            {kpis.notifications.slice(0, 5).map((n) => (
              <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid #1a1a2e", fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: n.priority === "critical" ? "#ef4444" : n.priority === "high" ? "#eab308" : "#94a3b8", fontWeight: 600, textTransform: "uppercase", fontSize: 11 }}>{n.priority}</span>
                  <span style={{ color: "#64748b", fontSize: 11 }}>{timeAgo(n.created_at)}</span>
                </div>
                <div style={{ marginTop: 4 }}>{n.title}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{n.source_agent} | {n.status}</div>
              </div>
            ))}
            {kpis.notifications.length === 0 && <div style={{ color: "#64748b", fontSize: 13 }}>No notifications</div>}
          </Card>
        </>
      )}

      {tab === "agents" && (
        <Card title="Agent Details">
          {agentStatus.map((a) => (
            <div key={a.key} style={{ padding: "12px 0", borderBottom: "1px solid #1a1a2e" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                <StatusDot status={a.health} />
                <span style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>every {a.schedule}</span>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", paddingLeft: 18 }}>
                Last run: {a.lastRun ? `${timeAgo(a.lastRun.created_at)} (${a.lastRun.duration_ms || "?"}ms)` : "never"}
                {a.errors > 0 && <span style={{ color: "#ef4444", marginLeft: 12 }}>{a.errors} errors</span>}
              </div>
            </div>
          ))}
        </Card>
      )}

      {tab === "notifications" && (
        <Card title="All Notifications">
          {kpis.notifications.map((n) => (
            <div key={n.id} style={{ padding: "10px 0", borderBottom: "1px solid #1a1a2e", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: n.priority === "critical" ? "#ef4444" : n.priority === "high" ? "#eab308" : "#94a3b8", fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>{n.priority}</span>
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: n.status === "pending" ? "#1e3a5f" : n.status === "sent" ? "#1a3a2e" : "#1e1e2e", color: n.status === "pending" ? "#60a5fa" : n.status === "sent" ? "#4ade80" : "#94a3b8" }}>{n.status}</span>
              </div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{n.source_agent} | {timeAgo(n.created_at)}</div>
            </div>
          ))}
        </Card>
      )}

      {tab === "content" && (
        <Card title="Content Feed">
          {contentFeed.map((c, i) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #1a1a2e", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600, textTransform: "uppercase" }}>{c.content_type}</span>
                <span style={{ fontSize: 11, color: "#64748b" }}>{c.channel}</span>
              </div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{c.title || "Untitled"}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                {c.created_by_agent} | {c.published_at ? timeAgo(c.published_at) : "draft"}
                {c.performance_score != null && <span style={{ marginLeft: 8 }}>Score: {c.performance_score}/100</span>}
              </div>
            </div>
          ))}
          {contentFeed.length === 0 && <div style={{ color: "#64748b" }}>No content published yet</div>}
        </Card>
      )}

      {tab === "logs" && (
        <Card title="Recent Activity">
          {logs.map((l, i) => (
            <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #1a1a2e", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ color: l.status === "error" ? "#ef4444" : "#4ade80", fontWeight: 600 }}>{l.agent_name}</span>
                <span style={{ color: "#94a3b8", marginLeft: 8 }}>{l.action}</span>
                {l.error && <span style={{ color: "#ef4444", marginLeft: 8 }}>{l.error.substring(0, 60)}</span>}
              </div>
              <span style={{ color: "#64748b", fontSize: 11, whiteSpace: "nowrap", marginLeft: 8 }}>{timeAgo(l.created_at)}</span>
            </div>
          ))}
        </Card>
      )}

      <footer style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: "#475569" }}>
        Ben Lalez Team AI Marketing OS | Compass Chicago | {AGENTS.length} Agents
      </footer>
    </div>
  );
}
