// Mock run: inserts test leads into Supabase, scores them, and verifies SMS alert for hot lead.

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../.env") });

import { logAction, createNotification, insertTestLead, updateLeadScore } from "./lib/supabase.js";

const TEST_LEADS = [
  {
    fub_lead_id: 900001,
    first_name: "Jessica",
    last_name: "Martinez",
    email: "jessica.martinez@example.com",
    phone: "+13125550101",
    source: "google_ads",
    buyer_seller: "buyer",
    stage: "new",
    total_touches: 5,
    email_opens: 4,
    email_clicks: 2,
    sms_replies: 1,
    target_neighborhoods: JSON.stringify(["Lincoln Park", "Lakeview"]),
    price_min: 450000,
    price_max: 650000,
    bedrooms_min: 2,
  },
  {
    fub_lead_id: 900002,
    first_name: "David",
    last_name: "Chen",
    email: "david.chen@example.com",
    phone: "+13125550102",
    source: "zillow",
    buyer_seller: "unknown",
    stage: "new",
    total_touches: 0,
    email_opens: 0,
  },
];

async function mockRun() {
  const start = Date.now();
  console.log("[Lead Scoring Mock] Starting...\n");

  // Step 1: Log start
  console.log("[Step 1] Logging agent_run_start...");
  await logAction("agent_run_start", "success", { mode: "mock" });
  console.log("  OK\n");

  // Step 2: Insert test leads
  const insertedLeads = [];
  for (const lead of TEST_LEADS) {
    console.log(`[Step 2] Inserting test lead: ${lead.first_name} ${lead.last_name}...`);
    const inserted = await insertTestLead(lead);
    if (inserted) {
      insertedLeads.push(inserted);
      console.log(`  OK — ID: ${inserted.id}\n`);
    } else {
      console.log("  SKIPPED (may already exist)\n");
    }
  }

  // Step 3: Score Jessica Martinez — hot lead (85/100)
  if (insertedLeads[0]) {
    const lead = insertedLeads[0];
    console.log(`[Step 3] Scoring ${lead.first_name} ${lead.last_name} as HOT (85/100)...`);
    await updateLeadScore(
      lead.id,
      85,
      "hot",
      "0-30 days",
      "High-intent Google Ads lead. Pre-qualified buyer targeting Lincoln Park/Lakeview with $450-650K budget. Strong engagement: 5 touches, 4 email opens, 2 clicks, 1 SMS reply. Ready to tour."
    );
    await logAction("score_lead", "success", {
      leadId: lead.id,
      score: 85,
      intentLevel: "hot",
      predictedTimeline: "0-30 days",
    }, null, null, lead.id);
    console.log("  OK\n");

    // Step 4: Create SMS alert for hot lead
    console.log(`[Step 4] Creating HOT LEAD SMS alert for Ben...`);
    const notification = await createNotification({
      priority: "critical",
      title: `HOT LEAD: ${lead.first_name} ${lead.last_name} scored 85/100`,
      message: `${lead.first_name} ${lead.last_name} (source: google_ads) just scored 85/100.\n\nIntent: hot\nTimeline: 0-30 days\n\nAI Notes: High-intent Google Ads lead. Pre-qualified buyer targeting Lincoln Park/Lakeview with $450-650K budget. Strong engagement: 5 touches, 4 email opens, 2 clicks, 1 SMS reply. Ready to tour.`,
      data: {
        leadId: lead.id,
        score: 85,
        intentLevel: "hot",
        firstName: lead.first_name,
        lastName: lead.last_name,
        source: lead.source,
      },
      relatedId: lead.id,
    });
    await logAction("hot_lead_alert", "success", {
      leadId: lead.id,
      score: 85,
      notificationId: notification?.id,
    }, null, null, lead.id);
    console.log(`  OK — notification ID: ${notification?.id}\n`);
  }

  // Step 5: Score David Chen — cold lead (22/100)
  if (insertedLeads[1]) {
    const lead = insertedLeads[1];
    console.log(`[Step 5] Scoring ${lead.first_name} ${lead.last_name} as COLD (22/100)...`);
    await updateLeadScore(
      lead.id,
      22,
      "cold",
      "90+ days",
      "Zillow inquiry with zero engagement. No email opens, no replies, unknown buyer/seller intent. Needs nurture sequence before re-evaluation."
    );
    await logAction("score_lead", "success", {
      leadId: lead.id,
      score: 22,
      intentLevel: "cold",
      predictedTimeline: "90+ days",
    }, null, null, lead.id);
    console.log("  OK (no SMS — score below 80)\n");
  }

  // Step 6: Log complete
  const duration = Date.now() - start;
  console.log("[Step 6] Logging agent_run_complete...");
  await logAction("agent_run_complete", "success", { mode: "mock", durationMs: duration }, null, duration);
  console.log("  OK\n");

  console.log("=".repeat(60));
  console.log("LEAD SCORING MOCK RUN COMPLETE");
  console.log("=".repeat(60));
  console.log(`Duration: ${duration}ms`);
  console.log(`Leads scored: ${insertedLeads.length}`);
  if (insertedLeads[0]) {
    console.log(`  - Jessica Martinez: 85/100 (HOT) — SMS alert created`);
  }
  if (insertedLeads[1]) {
    console.log(`  - David Chen: 22/100 (COLD) — no alert`);
  }
  console.log(`\nCheck Supabase:`);
  console.log(`  - lead_intelligence: 2 new rows with scores`);
  console.log(`  - agent_logs: scoring + alert actions`);
  console.log(`  - notification_queue: 1 new critical alert for Jessica Martinez`);
}

mockRun()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[Lead Scoring Mock] Fatal:", err);
    process.exit(1);
  });
