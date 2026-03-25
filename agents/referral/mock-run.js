// Mock run: inserts test closed clients, creates referral outreach tasks, and alerts Ben.

import { config } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(import.meta.dirname, "../../.env") });

import { logAction, createNotification, createAgentTask } from "./lib/supabase.js";

let _db;
function db() {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _db;
}

const TEST_CLIENTS = [
  {
    fub_lead_id: 800001,
    first_name: "Amanda",
    last_name: "Wright",
    email: "amanda.wright@example.com",
    phone: "+13125550201",
    source: "referral",
    buyer_seller: "buyer",
    stage: "closed",
    closing_value: 875000,
    closed_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago (anniversary!)
    last_touch_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
    property_address: "2145 N Lincoln Ave, Chicago IL 60614",
    lead_score: 0,
    total_touches: 12,
  },
  {
    fub_lead_id: 800002,
    first_name: "Robert",
    last_name: "Kim",
    email: "robert.kim@example.com",
    phone: "+13125550202",
    source: "google_ads",
    buyer_seller: "buyer",
    stage: "closed",
    closing_value: 420000,
    closed_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days ago
    last_touch_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
    property_address: "3821 N Southport Ave, Chicago IL 60613",
    lead_score: 0,
    total_touches: 8,
  },
];

async function mockRun() {
  const start = Date.now();
  console.log("[Referral Mock] Starting...\n");

  // Step 1: Log start
  console.log("[Step 1] Logging agent_run_start...");
  await logAction("agent_run_start", "success", { mode: "mock" });
  console.log("  OK\n");

  // Step 2: Insert test closed clients
  const inserted = [];
  for (const client of TEST_CLIENTS) {
    console.log(`[Step 2] Inserting closed client: ${client.first_name} ${client.last_name} ($${client.closing_value.toLocaleString()})...`);
    const { data, error } = await db().from("lead_intelligence").insert(client).select().single();
    if (data) {
      inserted.push(data);
      console.log(`  OK — ID: ${data.id}\n`);
    } else {
      console.log(`  SKIPPED: ${error?.message}\n`);
    }
  }

  // Step 3: Amanda Wright — high-value anniversary, notify Ben
  if (inserted[0]) {
    const client = inserted[0];
    console.log(`[Step 3] Creating HIGH-VALUE referral alert for Ben (Amanda Wright, $875K)...`);
    const notification = await createNotification({
      priority: "high",
      title: `Referral opportunity: Amanda Wright`,
      message: `Amanda Wright's 1-year purchase anniversary at 2145 N Lincoln Ave is coming up. Original closing: $875,000.\n\nSuggested action: Personal call + handwritten note. She was a referral herself — high likelihood of referring others.`,
      data: {
        clientName: "Amanda Wright",
        closingValue: 875000,
        leadId: client.id,
        type: "anniversary",
      },
      relatedId: client.id,
    });
    await logAction("referral_opportunity_alert", "success", {
      clientName: "Amanda Wright",
      notificationId: notification?.id,
    }, null, null, client.id);
    console.log(`  OK — notification ID: ${notification?.id}\n`);
  }

  // Step 4: Robert Kim — create referral outreach task for nurture agent
  if (inserted[1]) {
    const client = inserted[1];
    console.log(`[Step 4] Creating referral outreach task for Robert Kim...`);
    const task = await createAgentTask({
      assignedAgent: "nurture_agent",
      taskType: "referral_check_in",
      description: "Send check-in outreach to Robert Kim with subtle referral ask",
      payload: {
        leadId: client.id,
        firstName: "Robert",
        lastName: "Kim",
        outreachType: "check_in",
        suggestedMessage: "Hi Robert! Hope you're settling in well at Southport Ave. The neighborhood has been buzzing lately. If you know anyone looking to make a move in the area, I'd love to help them the same way. Enjoy the spring!",
        channel: "email",
      },
      priority: 5,
    });
    await logAction("create_referral_outreach", "success", {
      leadId: client.id,
      outreachType: "check_in",
      taskId: task?.id,
    }, null, null, client.id);
    console.log(`  OK — task ID: ${task?.id}\n`);
  }

  // Step 5: Log complete
  const duration = Date.now() - start;
  console.log("[Step 5] Logging agent_run_complete...");
  await logAction("agent_run_complete", "success", { mode: "mock", durationMs: duration }, null, duration);
  console.log("  OK\n");

  console.log("=".repeat(60));
  console.log("REFERRAL MOCK RUN COMPLETE");
  console.log("=".repeat(60));
  console.log(`Duration: ${duration}ms`);
  console.log(`Clients processed: ${inserted.length}`);
  if (inserted[0]) console.log(`  - Amanda Wright ($875K): Ben notified for personal call`);
  if (inserted[1]) console.log(`  - Robert Kim ($420K): Outreach task created for nurture agent`);
  console.log(`\nCheck Supabase:`);
  console.log(`  - lead_intelligence: 2 closed clients added`);
  console.log(`  - notification_queue: 1 high-priority alert (Amanda Wright)`);
  console.log(`  - agent_tasks: 1 referral outreach task (Robert Kim)`);
  console.log(`  - agent_logs: all actions logged`);
}

mockRun()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[Referral Mock] Fatal:", err);
    process.exit(1);
  });
