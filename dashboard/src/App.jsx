import { useState, useEffect, useCallback, useRef } from "react";
import { fetchAgentHealth, fetchNotifications, fetchAgentTasks, fetchTeamMembers, fetchApiSpend, saveConversation } from "./supabase.js";
import { sendToAgent } from "./anthropic.js";
import { AGENTS, USER_COLORS, AGENT_KEY_TO_LOG_NAME } from "./agents.js";

// ── Helpers ──
function timeAgo(dateStr) {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function nowTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

// ── Main App ──
export default function App() {
  const [currentUser, setCurrentUser] = useState("ben");
  const [currentView, setCurrentView] = useState("dashboard");
  const [currentAgent, setCurrentAgent] = useState(null);
  const [conversations, setConversations] = useState({});
  const [isTyping, setIsTyping] = useState(false);
  const [clock, setClock] = useState("");

  // Live data
  const [agentHealth, setAgentHealth] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [spend, setSpend] = useState([]);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Data refresh
  const refresh = useCallback(async () => {
    const [health, notifs, taskData, team, spendData] = await Promise.all([
      fetchAgentHealth(), fetchNotifications(), fetchAgentTasks(), fetchTeamMembers(), fetchApiSpend()
    ]);
    setAgentHealth(health);
    setNotifications(notifs);
    setTasks(taskData);
    setTeamMembers(team);
    setSpend(spendData);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [conversations, isTyping, currentAgent]);

  // Computed values
  const pendingNotifs = notifications.filter(n => n.status === "pending").length;
  const liveAgents = Object.values(AGENTS).filter(a => {
    const logName = AGENT_KEY_TO_LOG_NAME[Object.keys(AGENTS).find(k => AGENTS[k] === a)];
    const h = agentHealth[logName];
    return h && h.lastActive && (Date.now() - new Date(h.lastActive).getTime()) < 86400000;
  }).length;
  const offlineCount = Object.keys(AGENTS).length - liveAgents;

  const totalSpend = spend.reduce((s, r) => s + (parseFloat(r.estimated_cost_usd) || 0), 0);
  const spendByAgent = {};
  for (const r of spend) {
    if (!spendByAgent[r.agent_name]) spendByAgent[r.agent_name] = 0;
    spendByAgent[r.agent_name] += parseFloat(r.estimated_cost_usd) || 0;
  }
  const maxSpend = Math.max(...Object.values(spendByAgent), 0.001);

  // ── Navigation ──
  function openChat(agentKey) {
    setCurrentView("chat");
    setCurrentAgent(agentKey);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function goToDashboard() {
    setCurrentView("dashboard");
    setCurrentAgent(null);
  }

  // ── Chat ──
  async function sendMessage(text) {
    if (!text.trim() || isTyping || !currentAgent) return;
    setIsTyping(true);

    const agent = AGENTS[currentAgent];
    const userMsg = { role: "user", content: text, sender: currentUser, time: nowTime() };

    setConversations(prev => ({
      ...prev,
      [currentAgent]: [...(prev[currentAgent] || []), userMsg]
    }));

    try {
      const history = (conversations[currentAgent] || []).map(m => ({ role: m.role, content: m.content }));
      const systemPrompt = agent.persona + `\n\nYou are speaking with ${USER_COLORS[currentUser].label}. Be conversational, direct, and helpful. Keep responses focused and actionable. No bullet point overload — talk like a smart colleague.`;
      const reply = await sendToAgent(systemPrompt, [...history, { role: "user", content: text }], currentUser, currentAgent);

      const assistantMsg = { role: "assistant", content: reply, time: nowTime() };
      setConversations(prev => ({
        ...prev,
        [currentAgent]: [...(prev[currentAgent] || []), assistantMsg]
      }));

      saveConversation(currentUser, currentAgent, "user", text);
      saveConversation(currentUser, currentAgent, "assistant", reply);
    } catch (err) {
      const errMsg = { role: "assistant", content: err.message || "Connection error. Try again.", time: nowTime() };
      setConversations(prev => ({
        ...prev,
        [currentAgent]: [...(prev[currentAgent] || []), errMsg]
      }));
    }

    setIsTyping(false);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = inputRef.current?.value?.trim();
      if (text) {
        inputRef.current.value = "";
        sendMessage(text);
      }
    }
  }

  function handleSend() {
    const text = inputRef.current?.value?.trim();
    if (text) {
      inputRef.current.value = "";
      sendMessage(text);
    }
  }

  // ── Agent health for a given sidebar key ──
  function getHealth(agentSidebarKey) {
    const logName = AGENT_KEY_TO_LOG_NAME[agentSidebarKey];
    return agentHealth[logName] || null;
  }

  function getStatusColor(agentSidebarKey) {
    if (agentSidebarKey === "sms") return "var(--danger)";
    const h = getHealth(agentSidebarKey);
    if (!h || !h.lastActive) return "var(--gray3)";
    const minsAgo = (Date.now() - new Date(h.lastActive).getTime()) / 60000;
    if (minsAgo > 1440) return "var(--danger)";
    if (minsAgo > 120) return "var(--warn)";
    return "var(--ok)";
  }

  // ── Dashboard content by user ──
  function renderBenDashboard() {
    const websterH = agentHealth["content_seo"];
    const peterH = agentHealth["paid_ads"];
    const gmbH = agentHealth["gmb_agent"];
    const rogerH = agentHealth["intelligence"];
    const benAgents = [
      { key: "webster", name: "Webster", sub: "Content · 4h", h: websterH },
      { key: "peter", name: "Peter", sub: "Paid Ads · 4h", h: peterH },
      { key: "oliver", name: "GMB", sub: "Reviews · 2h", h: gmbH, chatTarget: "oliver" },
      { key: "roger", name: "Roger", sub: "Intelligence · 6h", h: rogerH },
    ];

    return (
      <>
        <SectionHdr title="Overnight Brief" />
        <div className="card" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 13, color: "#3a3a38", lineHeight: 1.7 }}>
            {websterH ? `Webster ran ${fmtNum(websterH.total)} tasks at ${websterH.rate}% success. ` : "Webster has no logged runs yet. "}
            {peterH ? `Peter ran ${fmtNum(peterH.total)} ops at ${peterH.rate}%. ` : "Peter has no logged runs yet. "}
            {gmbH ? `GMB at ${gmbH.rate}% — ${gmbH.errors} errors flagged. ` : ""}
            {rogerH ? `Roger intelligence at ${rogerH.rate}% clean. ` : ""}
            <strong>{pendingNotifs} approvals waiting for you.</strong>
          </p>
        </div>

        <SectionHdr title="Your KPIs" meta="marketing function" />
        <div className="metric-row" style={{ marginBottom: 14 }}>
          <Metric label="Pending Approvals" value={pendingNotifs} cls={pendingNotifs > 10 ? "warn" : "ok"} sub="content + ad creative" />
          <Metric label="Content Runs" value={websterH ? fmtNum(websterH.total) : "0"} sub={websterH ? `Webster · ${websterH.rate}%` : "no data"} />
          <Metric label="Paid Ad Runs" value={peterH ? fmtNum(peterH.total) : "0"} sub={peterH ? `Peter · ${peterH.rate}%` : "no data"} />
          <Metric label="API Spend" value={`$${totalSpend.toFixed(2)}`} sub={`${spend.length} runs tracked`} />
        </div>

        <SectionHdr title="Your Agents" meta="click Talk to message directly" />
        <div className="card" style={{ marginBottom: 14 }}>
          <AgentTable agents={benAgents} onChat={openChat} />
        </div>

        <SectionHdr title="Approval Queue" meta={`${pendingNotifs} pending`} />
        <div className="card">
          {notifications.filter(n => n.status === "pending").slice(0, 5).map(n => (
            <NotifRow key={n.id} n={n} />
          ))}
          {pendingNotifs > 5 && <div className="more">+ {pendingNotifs - 5} more in queue</div>}
          {pendingNotifs === 0 && <div className="more" style={{ color: "var(--gray3)" }}>Queue clear</div>}
        </div>
      </>
    );
  }

  function renderDavidDashboard() {
    const leadH = agentHealth["lead_scoring"];
    const referralH = agentHealth["referral_agent"];
    const emilleH = agentHealth["email_nurture"];
    const nurtureTasks = tasks.filter(t => t.assigned_agent === "email_nurture" || t.assigned_agent === "lead_scoring");
    const completedTasks = nurtureTasks.filter(t => t.status === "completed").length;

    return (
      <>
        <SectionHdr title="Overnight Brief" />
        <div className="card" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 13, color: "#3a3a38", lineHeight: 1.7 }}>
            {leadH ? `Lead scoring ran ${fmtNum(leadH.total)} cycles at ${leadH.rate}% success. ` : "Lead scoring has no logged runs. "}
            <strong>{nurtureTasks.length} nurture tasks queued — {completedTasks} completed.</strong>
            {referralH ? ` Referral agent ran ${fmtNum(referralH.total)} sphere touches at ${referralH.rate}%.` : ""}
            {emilleH ? ` Emille email running at ${emilleH.rate}%.` : ""}
          </p>
        </div>

        <SectionHdr title="Sales KPIs" />
        <div className="metric-row" style={{ marginBottom: 14 }}>
          <Metric label="Lead Score Runs" value={leadH ? fmtNum(leadH.total) : "0"} sub={leadH ? `${leadH.rate}% success` : "no data"} />
          <Metric label="Nurture Tasks" value={nurtureTasks.length} cls={nurtureTasks.length > 50 ? "warn" : ""} sub={`${completedTasks} completed`} />
          <Metric label="Referral Touches" value={referralH ? fmtNum(referralH.total) : "0"} sub={referralH ? `${referralH.rate}% success` : "no data"} />
          <Metric label="Approvals Pending" value={0} cls="ok" sub="sales queue clear" />
        </div>

        <SectionHdr title="Sales Agents" />
        <div className="card" style={{ marginBottom: 14 }}>
          <AgentTable agents={[
            { key: "lead", name: "Lead Scoring", sub: "FUB · 15min", h: leadH },
            { key: "oliver", name: "Referral", sub: "Sphere · 12h", h: referralH, chatTarget: "oliver" },
            { key: "emille", name: "Emille", sub: "Email · 10min", h: emilleH },
          ]} onChat={openChat} />
        </div>

        <SectionHdr title="Real Estate Agents · YTD" meta="from team_members" />
        <div className="card">
          {teamMembers.length > 0 ? teamMembers.map((m, i) => (
            <div key={i} className="notif-row">
              <div>
                <div className="notif-title">{m.name}</div>
                <div className="notif-meta">{m.role}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono',monospace", color: m.ytd_closings > 0 ? "var(--black)" : "var(--gray3)" }}>
                {m.ytd_closings || 0}
              </div>
            </div>
          )) : <div className="more" style={{ color: "var(--gray3)" }}>No team members loaded</div>}
        </div>
      </>
    );
  }

  function renderMarshallDashboard() {
    const oliverH = agentHealth["orchestrator"];
    const rogerH = agentHealth["intelligence"];

    return (
      <>
        <SectionHdr title="Overnight Brief" />
        <div className="card" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 13, color: "#3a3a38", lineHeight: 1.7 }}>
            {oliverH ? `Oliver orchestrated ${fmtNum(oliverH.total)} tasks at ${oliverH.rate}% success. ` : "Oliver has no logged runs. "}
            {rogerH ? `Roger ran ${fmtNum(rogerH.total)} intelligence operations at ${rogerH.rate}%. ` : ""}
            <strong style={{ color: "#dc2626" }}>SMS agent deliberately disabled — was generating Twilio errors.</strong>
          </p>
        </div>

        <SectionHdr title="Operations KPIs" />
        <div className="metric-row" style={{ marginBottom: 14 }}>
          <Metric label="Orchestrator" value={oliverH ? `${oliverH.rate}%` : "—"} sub={oliverH ? `Oliver · ${fmtNum(oliverH.total)} runs` : "no data"} />
          <Metric label="Pending Alerts" value={pendingNotifs} cls={pendingNotifs > 5 ? "danger" : ""} sub="in notification queue" />
          <Metric label="Tasks Queued" value={tasks.length} cls={tasks.length > 100 ? "warn" : ""} sub={`${tasks.filter(t => t.status === "completed").length} completed`} />
          <Metric label="API Spend" value={`$${totalSpend.toFixed(4)}`} sub={`${spend.length} runs tracked`} />
        </div>

        <SectionHdr title="Operations Agents" />
        <div className="card" style={{ marginBottom: 14 }}>
          <AgentTable agents={[
            { key: "oliver", name: "Oliver", sub: "Orchestrator · 30min", h: oliverH },
            { key: "roger", name: "Roger", sub: "Intelligence · 6h", h: rogerH },
            { key: "sms", name: "SMS", sub: "Disabled", h: null, offline: true },
          ]} onChat={openChat} />
        </div>

        <SectionHdr title="API Spend · All Time" />
        <div className="card">
          <div className="spend-hero">${totalSpend.toFixed(4)}</div>
          <div className="spend-sub">{spend.length} runs tracked</div>
          {Object.entries(spendByAgent).sort((a, b) => b[1] - a[1]).map(([name, amt]) => (
            <div key={name} className="spend-row">
              <div className="spend-name">{name}</div>
              <div className="spend-track"><div className="spend-fill" style={{ width: `${(amt / maxSpend) * 100}%` }} /></div>
              <div className="spend-amt">${amt.toFixed(4)}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // ── Chat view ──
  function renderChatView() {
    const agent = AGENTS[currentAgent];
    const msgs = conversations[currentAgent] || [];
    const isOffline = currentAgent === "sms";

    return (
      <div className="chat-view">
        <div className="chat-topbar">
          <button className="chat-back" onClick={goToDashboard}>← Dashboard</button>
          <div className="chat-agent-info">
            <div className="chat-agent-name">{agent.name}</div>
            <div className="chat-agent-role">{agent.role}</div>
          </div>
          <div className="chat-status">
            <div className="dot" style={{ background: isOffline ? "var(--danger)" : "var(--ok)", animation: isOffline ? "blink 1s infinite" : "none" }} />
            {isOffline ? <span style={{ color: "var(--danger)" }}>Offline</span> : "Live"}
          </div>
        </div>

        <div className="chat-messages">
          {msgs.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-name">{agent.name}</div>
              <div style={{ fontSize: 13, color: "var(--gray2)", marginBottom: 16, textAlign: "center", maxWidth: 400 }}>{agent.role}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 480 }}>
                {agent.starters.map((s, i) => (
                  <button key={i} className="starter" onClick={() => sendMessage(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            msgs.map((m, i) => {
              const isUser = m.role === "user";
              const u = USER_COLORS[m.sender || currentUser];
              return (
                <div key={i} className={`msg ${isUser ? "user" : "assistant"}`}>
                  <div className="msg-avatar" style={{
                    background: isUser ? u.bg : "#f7f5f2",
                    color: isUser ? u.color : "#111",
                    border: isUser ? "1px solid transparent" : "1px solid #e8e4df"
                  }}>
                    {isUser ? u.initials : agent.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: m.content.replace(/\n/g, "<br>") }} />
                    <div className="msg-time">{m.time}</div>
                  </div>
                </div>
              );
            })
          )}
          {isTyping && (
            <div className="msg assistant">
              <div className="msg-avatar" style={{ background: "#f7f5f2", color: "#111", border: "1px solid #e8e4df" }}>
                {AGENTS[currentAgent]?.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="typing-bubble">
                <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-bar">
          <div style={{ flex: 1 }}>
            <div className="chat-sender-select">
              {["ben", "david", "marshall"].map(u => (
                <button key={u} className={`sender-btn ${currentUser === u ? `active-${u}` : ""}`}
                  onClick={() => setCurrentUser(u)}>
                  {USER_COLORS[u].label}
                </button>
              ))}
            </div>
            <textarea ref={inputRef} className="chat-textarea" placeholder={`Talk to ${AGENTS[currentAgent]?.name}...`}
              rows={1} onKeyDown={handleKey}
              onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            />
          </div>
          <button className="chat-send" onClick={handleSend} disabled={isTyping}>↑</button>
        </div>
      </div>
    );
  }

  // ── RENDER ──
  return (
    <div className="app">
      {/* HEADER */}
      <div className="header">
        <div>
          <span className="wordmark">Ben Lalez Team</span>
          <span className="wordmark-sub">Command Center</span>
        </div>
        <div className="header-right">
          {offlineCount > 0 && (
            <div className="chip chip-danger"><div className="dot dot-danger" />{offlineCount} offline</div>
          )}
          {pendingNotifs > 0 && (
            <div className="chip chip-warn"><div className="dot dot-warn" />{pendingNotifs} pending</div>
          )}
          <div className="chip chip-ok"><div className="dot dot-ok" />{liveAgents} agents live</div>
          <div className="clock">{clock}</div>
        </div>
      </div>

      <div className="main">
        {/* SIDEBAR */}
        <div className="sidebar">
          <div style={{ padding: "8px 0 4px" }}>
            <div className="sidebar-section">Operators</div>
            {["ben", "david", "marshall"].map(u => (
              <div key={u} className={`nav-item ${currentUser === u ? "active" : ""}`} onClick={() => { setCurrentUser(u); if (currentView === "dashboard") goToDashboard(); }}>
                <div className="nav-avatar" style={{
                  background: USER_COLORS[u].bg,
                  color: USER_COLORS[u].color,
                  border: u !== "ben" ? `1px solid ${u === "david" ? "var(--blue-border)" : "var(--green-border)"}` : "none"
                }}>
                  {USER_COLORS[u].initials}
                </div>
                <div>
                  <div className="nav-name">{USER_COLORS[u].label}{u === "ben" ? " Lalez" : u === "david" ? " Fields" : ""}</div>
                  <div className="nav-role">{u === "ben" ? "Marketing · Strategy" : u === "david" ? "Sales · Coaching" : "Operations · Transactions"}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="sidebar-divider" />

          <div>
            <div className="sidebar-section">Agents</div>
            {Object.entries(AGENTS).map(([key, agent]) => (
              <div key={key} className={`agent-nav-item ${currentAgent === key ? "active" : ""}`} onClick={() => openChat(key)}>
                <div className="agent-status-dot" style={{
                  background: getStatusColor(key),
                  animation: key === "sms" ? "blink 1.2s infinite" : "none"
                }} />
                <div className="agent-nav-name">{agent.name}</div>
                <div className="agent-nav-sub">{key === "sms" ? "Disabled" : agent.role.split("·")[0].trim()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CONTENT */}
        <div className="content">
          {currentView === "dashboard" ? (
            <div className="dashboard-view">
              {currentUser === "ben" && renderBenDashboard()}
              {currentUser === "david" && renderDavidDashboard()}
              {currentUser === "marshall" && renderMarshallDashboard()}
            </div>
          ) : (
            renderChatView()
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ──

function SectionHdr({ title, meta }) {
  return (
    <div className="section-hdr">
      <div className="sec-title">{title}</div>
      {meta && <div className="sec-meta">{meta}</div>}
    </div>
  );
}

function Metric({ label, value, sub, cls }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className={`metric-val ${cls || ""}`}>{value}</div>
      <div className="metric-sub">{sub}</div>
    </div>
  );
}

function AgentTable({ agents, onChat }) {
  return (
    <table className="agent-table">
      <thead><tr><th>Agent</th><th>Rate</th><th>Runs</th><th>Last active</th><th></th></tr></thead>
      <tbody>
        {agents.map(a => {
          const h = a.h;
          const isOffline = a.offline;
          const dotColor = isOffline ? "var(--danger)" : h ? (parseFloat(h.rate) >= 98 ? "var(--ok)" : parseFloat(h.rate) >= 95 ? "var(--warn)" : "var(--danger)") : "var(--gray3)";
          const rateClass = isOffline ? "rate-crit" : h ? (parseFloat(h.rate) >= 98 ? "rate-ok" : parseFloat(h.rate) >= 95 ? "rate-warn" : "rate-crit") : "";

          return (
            <tr key={a.key}>
              <td>
                <div className="at-name">
                  <div className="dot" style={{ background: dotColor, animation: isOffline ? "blink 1s infinite" : "none" }} />
                  {a.name}<span className="at-sub">{a.sub}</span>
                </div>
              </td>
              <td><div className={`at-rate ${rateClass}`}>{isOffline ? "Offline" : h ? `${h.rate}%` : "—"}</div></td>
              <td className="at-mono">{h ? fmtNum(h.total) : "—"}</td>
              <td className="at-dim">{h ? timeAgo(h.lastActive) : isOffline ? "disabled" : "never"}</td>
              <td><button className="chat-btn" onClick={() => onChat(a.chatTarget || a.key)}>{isOffline ? "Diagnose" : "Talk"}</button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function NotifRow({ n }) {
  const pillClass = n.priority === "critical" ? "np-crit" : n.priority === "high" ? "np-high" : n.status === "sent" ? "np-sent" : "np-norm";
  return (
    <div className="notif-row">
      <div>
        <div className="notif-title">{n.title || n.notification_type}</div>
        <div className="notif-meta">{n.priority} · {n.source_agent} · {timeAgo(n.created_at)}</div>
      </div>
      <div className={`npill ${pillClass}`}>{n.priority}</div>
    </div>
  );
}
