// SYSTEMS STAN v1.0 — agents/infrastructure/stan.js
// Infrastructure governance agent for the Ben Lalez AI city.
// Audits credentials, enforces naming conventions, monitors agent health,
// and writes weekly infrastructure maps to shared_intelligence.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../.env") });

// ============================================
// SUPABASE CLIENT
// ============================================
let _supabase;
function db() {
  if (!_supabase)
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  return _supabase;
}

async function logAction(action, status, payload = {}, error = null) {
  try {
    await db().from("agent_logs").insert({
      agent_name: "systems_stan",
      action,
      status,
      payload,
      error,
    });
  } catch (e) {
    console.error("[Stan] Failed to log action:", e.message);
  }
}

// ============================================
// NAMING CONVENTION VALIDATOR
// ============================================
const SCREAMING_SNAKE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export function validateNamingConvention(name, type) {
  if (!name || typeof name !== "string") {
    return { pass: false, reason: "Name is empty or not a string" };
  }

  switch (type) {
    case "railway_env":
      if (SCREAMING_SNAKE.test(name)) {
        return { pass: true, reason: "Valid SCREAMING_SNAKE_CASE" };
      }
      return {
        pass: false,
        reason: `Railway env var "${name}" must be SCREAMING_SNAKE_CASE (e.g. MY_API_KEY)`,
      };

    case "supabase_table":
      if (SNAKE_CASE.test(name)) {
        return { pass: true, reason: "Valid snake_case" };
      }
      return {
        pass: false,
        reason: `Supabase table "${name}" must be snake_case (e.g. agent_logs)`,
      };

    case "agent_name":
      if (SNAKE_CASE.test(name)) {
        return { pass: true, reason: "Valid snake_case" };
      }
      return {
        pass: false,
        reason: `Agent name "${name}" must be snake_case (e.g. systems_stan)`,
      };

    default:
      return { pass: false, reason: `Unknown type "${type}"` };
  }
}

// ============================================
// CREDENTIAL AUDIT
// ============================================
async function auditCredentials() {
  console.log("[Stan] Auditing credentials in integration_registry...");

  const { data: flagged, error } = await db()
    .from("integration_registry")
    .select("*")
    .or("status.neq.active,env_vars_present.is.null");

  if (error) {
    console.error("[Stan] Failed to query integration_registry:", error.message);
    return { status: "red", issues: [], error: error.message };
  }

  const issues = [];

  for (const row of flagged || []) {
    const issue = {
      service: row.service_name,
      category: row.category,
      status: row.status,
      problem: [],
    };

    if (row.status !== "active") {
      issue.problem.push(`Status is "${row.status}" (not active)`);
    }

    if (!row.env_vars_present || row.env_vars_present.length === 0) {
      issue.problem.push("No env vars present — credentials missing or unverified");
    } else if (row.env_vars_needed && row.env_vars_needed.length > 0) {
      const missing = row.env_vars_needed.filter(
        (v) => !row.env_vars_present.includes(v)
      );
      if (missing.length > 0) {
        issue.problem.push(`Missing env vars: ${missing.join(", ")}`);
      }
    }

    if (row.error_message) {
      issue.problem.push(`Last error: ${row.error_message}`);
    }

    if (issue.problem.length > 0) {
      issues.push(issue);
    }
  }

  // Check for expiring trials — look for last_tested older than 14 days or status hints
  const { data: allIntegrations } = await db()
    .from("integration_registry")
    .select("service_name, status, last_tested, estimated_roi, description");

  const now = Date.now();
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;

  for (const row of allIntegrations || []) {
    const desc = (row.description || "").toLowerCase();
    const roi = (row.estimated_roi || "").toLowerCase();
    if (
      desc.includes("trial") ||
      desc.includes("expir") ||
      roi.includes("trial")
    ) {
      if (
        row.last_tested &&
        now - new Date(row.last_tested).getTime() > fourteenDays
      ) {
        issues.push({
          service: row.service_name,
          category: "expiry_warning",
          status: row.status,
          problem: [
            "May be on a trial — last tested over 14 days ago. Verify credential validity.",
          ],
        });
      }
    }
  }

  const color =
    issues.length === 0 ? "green" : issues.length <= 3 ? "yellow" : "red";
  console.log(
    `[Stan] Credential audit: ${color.toUpperCase()} — ${issues.length} issue(s) found`
  );
  return { status: color, issues };
}

// ============================================
// AGENT ERROR AUDIT
// ============================================
async function auditAgentErrors() {
  console.log("[Stan] Auditing agent_logs for errors in last 24h...");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: errors, error } = await db()
    .from("agent_logs")
    .select("agent_name, action, error, created_at")
    .eq("status", "error")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[Stan] Failed to query agent_logs:", error.message);
    return { status: "red", summary: {}, error: error.message };
  }

  // Group by agent + error pattern
  const grouped = {};
  for (const row of errors || []) {
    const key = row.agent_name || "unknown";
    if (!grouped[key]) grouped[key] = { count: 0, actions: {}, errors: [] };
    grouped[key].count++;
    grouped[key].actions[row.action] =
      (grouped[key].actions[row.action] || 0) + 1;
    if (grouped[key].errors.length < 3) {
      grouped[key].errors.push(
        (row.error || "no message").substring(0, 200)
      );
    }
  }

  // Flag credential-related errors
  const credentialErrors = (errors || []).filter((e) => {
    const msg = (e.error || "").toLowerCase();
    return (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("unauthorized") ||
      msg.includes("credential") ||
      msg.includes("token") ||
      msg.includes("api key") ||
      msg.includes("permission denied")
    );
  });

  const totalErrors = (errors || []).length;
  const color =
    totalErrors === 0 ? "green" : totalErrors <= 5 ? "yellow" : "red";
  console.log(
    `[Stan] Error audit: ${color.toUpperCase()} — ${totalErrors} errors across ${Object.keys(grouped).length} agent(s)`
  );

  return {
    status: color,
    total_errors: totalErrors,
    credential_errors: credentialErrors.length,
    by_agent: grouped,
  };
}

// ============================================
// NAMING CONVENTION AUDIT
// ============================================
async function auditNamingConventions() {
  console.log("[Stan] Auditing naming conventions...");

  const violations = [];

  // Check agent names in agent_definitions
  const { data: agents } = await db()
    .from("agent_definitions")
    .select("agent_name, display_name");

  for (const a of agents || []) {
    const check = validateNamingConvention(a.agent_name, "agent_name");
    if (!check.pass) {
      violations.push({
        entity: `agent: ${a.agent_name}`,
        violation: check.reason,
      });
    }
  }

  // Check table names
  const { data: tables } = await db().rpc("get_table_names").catch(() => ({
    data: null,
  }));

  // Fallback: query information_schema directly
  if (!tables) {
    const { data: schemaTables } = await db()
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public");

    for (const t of schemaTables || []) {
      const check = validateNamingConvention(t.table_name, "supabase_table");
      if (!check.pass) {
        violations.push({
          entity: `table: ${t.table_name}`,
          violation: check.reason,
        });
      }
    }
  }

  // Check integration_registry service names as proxy for env var naming
  const { data: integrations } = await db()
    .from("integration_registry")
    .select("service_name, env_vars_needed");

  for (const i of integrations || []) {
    for (const envVar of i.env_vars_needed || []) {
      const check = validateNamingConvention(envVar, "railway_env");
      if (!check.pass) {
        violations.push({
          entity: `env var for ${i.service_name}: ${envVar}`,
          violation: check.reason,
        });
      }
    }
  }

  const color =
    violations.length === 0
      ? "green"
      : violations.length <= 5
        ? "yellow"
        : "red";
  console.log(
    `[Stan] Naming audit: ${color.toUpperCase()} — ${violations.length} violation(s)`
  );
  return { status: color, violations };
}

// ============================================
// WRITE INFRASTRUCTURE MAP TO shared_intelligence
// ============================================
async function writeInfrastructureMap(credentialAudit, errorAudit, namingAudit) {
  const today = new Date().toISOString().split("T")[0];
  const title = `Stan Infrastructure Audit — ${today}`;

  const overall =
    credentialAudit.status === "red" ||
    errorAudit.status === "red" ||
    namingAudit.status === "red"
      ? "red"
      : credentialAudit.status === "yellow" ||
          errorAudit.status === "yellow" ||
          namingAudit.status === "yellow"
        ? "yellow"
        : "green";

  const insight = [
    `## Infrastructure Status: ${overall.toUpperCase()}`,
    "",
    `### Credentials: ${credentialAudit.status.toUpperCase()}`,
    credentialAudit.issues.length === 0
      ? "All integrations healthy."
      : credentialAudit.issues
          .map(
            (i) =>
              `- **${i.service}** (${i.status}): ${i.problem.join("; ")}`
          )
          .join("\n"),
    "",
    `### Agent Errors (24h): ${errorAudit.status.toUpperCase()}`,
    `Total: ${errorAudit.total_errors} | Credential-related: ${errorAudit.credential_errors}`,
    ...Object.entries(errorAudit.by_agent || {}).map(
      ([agent, info]) =>
        `- **${agent}**: ${info.count} errors — ${Object.entries(info.actions).map(([a, c]) => `${a}(${c})`).join(", ")}`
    ),
    "",
    `### Naming Conventions: ${namingAudit.status.toUpperCase()}`,
    namingAudit.violations.length === 0
      ? "All names compliant."
      : namingAudit.violations
          .map((v) => `- ${v.entity}: ${v.violation}`)
          .join("\n"),
  ].join("\n");

  // Upsert: replace today's report if re-run
  const { data: existing } = await db()
    .from("shared_intelligence")
    .select("id")
    .eq("source_agent", "systems_stan")
    .eq("title", title)
    .limit(1);

  if (existing && existing.length > 0) {
    await db()
      .from("shared_intelligence")
      .update({
        insight,
        data: {
          overall,
          credentials: credentialAudit,
          errors: errorAudit,
          naming: namingAudit,
          generated_at: new Date().toISOString(),
        },
        confidence: overall === "green" ? 1.0 : overall === "yellow" ? 0.7 : 0.4,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing[0].id);
    console.log(`[Stan] Updated existing report: ${title}`);
  } else {
    await db()
      .from("shared_intelligence")
      .insert({
        source_agent: "systems_stan",
        intelligence_type: "infrastructure_audit",
        title,
        insight,
        data: {
          overall,
          credentials: credentialAudit,
          errors: errorAudit,
          naming: namingAudit,
          generated_at: new Date().toISOString(),
        },
        confidence: overall === "green" ? 1.0 : overall === "yellow" ? 0.7 : 0.4,
        target_agents: ["oliver", "remy_orchestrator"],
        tags: ["infrastructure", "credentials", "health", "naming"],
        status: "active",
      });
    console.log(`[Stan] Published new report: ${title}`);
  }

  return { title, overall };
}

// ============================================
// MAIN: RUN STAN
// ============================================
async function runStan() {
  const startTime = Date.now();
  console.log("=".repeat(60));
  console.log("[Stan] Systems Stan v1.0 — Infrastructure Audit Starting");
  console.log(`[Stan] Time: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  // Circuit breaker
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "[Stan] CIRCUIT BREAKER: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
    return;
  }

  await logAction("infrastructure_audit_start", "success", {
    version: "1.0",
  });

  try {
    // 1. Credential audit
    const credentialAudit = await auditCredentials();

    // 2. Agent error audit
    const errorAudit = await auditAgentErrors();

    // 3. Naming convention audit
    const namingAudit = await auditNamingConventions();

    // 4. Write infrastructure map
    const report = await writeInfrastructureMap(
      credentialAudit,
      errorAudit,
      namingAudit
    );

    const duration = Date.now() - startTime;

    // Summary
    console.log("");
    console.log("=".repeat(60));
    console.log(`[Stan] AUDIT COMPLETE — Overall: ${report.overall.toUpperCase()}`);
    console.log(`[Stan] Credentials: ${credentialAudit.status.toUpperCase()} (${credentialAudit.issues.length} issues)`);
    console.log(`[Stan] Agent Errors: ${errorAudit.status.toUpperCase()} (${errorAudit.total_errors} total, ${errorAudit.credential_errors} credential-related)`);
    console.log(`[Stan] Naming: ${namingAudit.status.toUpperCase()} (${namingAudit.violations.length} violations)`);
    console.log(`[Stan] Report: "${report.title}"`);
    console.log(`[Stan] Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log("=".repeat(60));

    await logAction("infrastructure_audit_complete", "success", {
      overall: report.overall,
      credential_issues: credentialAudit.issues.length,
      total_errors: errorAudit.total_errors,
      naming_violations: namingAudit.violations.length,
      duration_ms: duration,
    });

    return report;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[Stan] FATAL ERROR: ${err.message}`);
    console.error(err.stack);
    await logAction(
      "infrastructure_audit_error",
      "error",
      { duration_ms: duration },
      err.message
    );
    throw err;
  }
}

// ============================================
// ENTRYPOINT
// ============================================
runStan()
  .then((report) => {
    if (report) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
