import { config } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

config({ path: resolve(import.meta.dirname, "../../.env") });

// --- Clients (lazy init) ---

let _supabase;
function db() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

let _twilio;
function sms() {
  if (!_twilio) {
    _twilio = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return _twilio;
}

// --- Core functions ---

function formatNotificationBody(notification) {
  const priority = notification.priority.toUpperCase();
  const lines = [
    `[${priority}] ${notification.title}`,
    "",
    notification.message,
  ];

  // Truncate to fit SMS limits (1600 chars for Twilio)
  const body = lines.join("\n");
  if (body.length > 1550) {
    return body.substring(0, 1547) + "...";
  }
  return body;
}

async function sendSms(to, body) {
  const message = await sms().messages.create({
    body,
    from: process.env.TWILIO_FROM_NUMBER,
    to,
  });
  return message;
}

async function logAction(action, status, payload = {}, error = null) {
  await db().from("agent_logs").insert({
    agent_name: "notification_sms",
    action,
    status,
    payload,
    error,
  });
}

async function markAsSent(notificationId, twilioSid) {
  const { error } = await db()
    .from("notification_queue")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      delivered: true,
      data: db().rpc ? undefined : undefined, // keep existing data
    })
    .eq("id", notificationId);

  if (error) {
    console.error(`Failed to mark notification ${notificationId} as sent:`, error.message);
    return;
  }

  // Log the send separately with Twilio SID for audit trail
  await logAction("sms_sent", "success", {
    notificationId,
    twilioSid,
  });
}

// --- Process pending notifications ---

export async function processPendingNotifications() {
  console.log("[SMS] Checking for pending critical notifications...");

  const { data: notifications, error } = await db()
    .from("notification_queue")
    .select("*")
    .in("status", ["pending"])
    .in("channel", ["sms", "both"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[SMS] Failed to fetch notifications:", error.message);
    await logAction("fetch_pending", "error", {}, error.message);
    return;
  }

  if (!notifications || notifications.length === 0) {
    console.log("[SMS] No pending notifications.");
    return;
  }

  console.log(`[SMS] Found ${notifications.length} pending notification(s).`);
  const to = process.env.BEN_PHONE_NUMBER;

  for (const notification of notifications) {
    try {
      const body = formatNotificationBody(notification);
      console.log(`[SMS] Sending: "${notification.title}" (${notification.priority})...`);

      const message = await sendSms(to, body);
      console.log(`[SMS]   Sent — Twilio SID: ${message.sid}`);

      await markAsSent(notification.id, message.sid);
      console.log(`[SMS]   Marked as sent in notification_queue.`);
    } catch (err) {
      console.error(`[SMS]   FAILED: ${err.message}`);
      await logAction("sms_send_failed", "error", {
        notificationId: notification.id,
        title: notification.title,
      }, err.message);
    }
  }

  console.log("[SMS] Done.");
}

// --- Send a specific notification by ID ---

export async function sendNotificationById(notificationId) {
  console.log(`[SMS] Fetching notification ${notificationId}...`);

  const { data: notification, error } = await db()
    .from("notification_queue")
    .select("*")
    .eq("id", notificationId)
    .single();

  if (error || !notification) {
    console.error("[SMS] Notification not found:", error?.message);
    return;
  }

  const body = formatNotificationBody(notification);
  const to = process.env.BEN_PHONE_NUMBER;

  console.log(`[SMS] Sending to ${to}...`);
  console.log(`[SMS] Body:\n${body}\n`);

  const message = await sendSms(to, body);
  console.log(`[SMS] Sent — Twilio SID: ${message.sid}`);

  await markAsSent(notification.id, message.sid);
  console.log(`[SMS] Marked as sent in notification_queue.`);

  return message;
}

// --- Entry point ---

const command = process.argv[2];
const arg = process.argv[3];

if (command === "process") {
  // Process all pending notifications
  processPendingNotifications()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[SMS] Fatal:", err);
      process.exit(1);
    });
} else if (command === "send" && arg) {
  // Send a specific notification by ID
  sendNotificationById(arg)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[SMS] Fatal:", err);
      process.exit(1);
    });
} else if (command === "test") {
  // Send the Mike Reynolds 2-star review notification
  (async () => {
    console.log("[SMS] Test mode — finding the Mike Reynolds notification...");

    const { data, error } = await db()
      .from("notification_queue")
      .select("*")
      .eq("priority", "critical")
      .ilike("title", "%Mike Reynolds%")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      console.error("[SMS] Could not find the Mike Reynolds notification:", error?.message);
      process.exit(1);
    }

    console.log(`[SMS] Found notification: ${data.id}`);
    console.log(`[SMS] Title: ${data.title}`);
    console.log(`[SMS] Status: ${data.status}\n`);

    await sendNotificationById(data.id);
    console.log("\n[SMS] Test complete.");
  })()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[SMS] Fatal:", err);
      process.exit(1);
    });
} else {
  console.log(`Usage:
  node agents/notifications/sms.js process     Process all pending SMS notifications
  node agents/notifications/sms.js send <id>   Send a specific notification by ID
  node agents/notifications/sms.js test        Send the Mike Reynolds test notification`);
}
