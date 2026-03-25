// Mock run: bypasses Claude API and external review APIs, but writes real data
// to Supabase to verify the full pipeline works end-to-end.

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../.env") });

import { logAction, createNotification } from "./lib/supabase.js";

const MOCK_REVIEWS = [
  {
    platform: "google",
    reviewId: "mock_google_5star_001",
    author: "Sarah Thompson",
    rating: 5,
    text: "Ben and his team were absolutely amazing! They helped us find our dream home in Lincoln Park in under two weeks. Professional, responsive, and genuinely caring. Highly recommend!",
    createdAt: new Date().toISOString(),
  },
  {
    platform: "google",
    reviewId: "mock_google_2star_001",
    author: "Mike Reynolds",
    rating: 2,
    text: "Communication was lacking during the closing process. Felt like I had to chase down updates constantly. The end result was fine but the experience was stressful.",
    createdAt: new Date().toISOString(),
  },
];

const DRAFTED_RESPONSE = `Thank you for sharing your feedback, Mike. I'm sorry to hear the communication during your closing didn't meet expectations — that's not the experience we strive to provide. Every client deserves to feel informed and supported throughout the process. I'd love the opportunity to discuss this further and understand how we can make it right. Please don't hesitate to reach out to me directly at any time. — Ben Lalez`;

async function mockRun() {
  const start = Date.now();
  console.log("[GMB Agent Mock] Starting mock run...\n");

  // Step 1: Log agent run start
  console.log("[Step 1] Logging agent_run_start...");
  await logAction("agent_run_start", "success", { mode: "mock" });
  console.log("  OK\n");

  // Step 2: Log the review check action
  console.log("[Step 2] Logging check_google_reviews...");
  await logAction("check_google_reviews", "success", {
    platform: "google",
    reviewCount: MOCK_REVIEWS.length,
    sinceDate: null,
  }, null, 120);
  console.log("  OK\n");

  // Step 3: Log each review individually
  for (const review of MOCK_REVIEWS) {
    console.log(`[Step 3] Logging review from ${review.author} (${review.rating} stars)...`);
    await logAction("review_found", "success", {
      platform: review.platform,
      reviewId: review.reviewId,
      author: review.author,
      rating: review.rating,
      text: review.text,
      createdAt: review.createdAt,
    });
    console.log("  OK\n");
  }

  // Step 4: Create Tier 1 notification for the 2-star review
  const negativeReview = MOCK_REVIEWS.find((r) => r.rating <= 3);
  console.log(`[Step 4] Creating Tier 1 notification for ${negativeReview.rating}-star review...`);
  const notification = await createNotification({
    notificationType: "approval_required",
    priority: "critical",
    title: `Negative ${negativeReview.rating}-star review on ${negativeReview.platform} from ${negativeReview.author}`,
    message: `Review: "${negativeReview.text}"\n\nDrafted response:\n"${DRAFTED_RESPONSE}"`,
    data: {
      platform: negativeReview.platform,
      reviewId: negativeReview.reviewId,
      author: negativeReview.author,
      rating: negativeReview.rating,
      reviewText: negativeReview.text,
      draftedResponse: DRAFTED_RESPONSE,
    },
    channel: "sms",
  });
  console.log(`  OK — notification ID: ${notification?.id}\n`);

  // Step 5: Log the notification creation
  console.log("[Step 5] Logging negative_review_notification...");
  await logAction("negative_review_notification", "success", {
    platform: negativeReview.platform,
    reviewId: negativeReview.reviewId,
    rating: negativeReview.rating,
    notificationId: notification?.id,
  });
  console.log("  OK\n");

  // Step 6: Log agent run complete
  const duration = Date.now() - start;
  console.log("[Step 6] Logging agent_run_complete...");
  await logAction("agent_run_complete", "success", {
    mode: "mock",
    iterations: 1,
    durationMs: duration,
  }, null, duration);
  console.log("  OK\n");

  console.log("=".repeat(60));
  console.log("MOCK RUN COMPLETE");
  console.log("=".repeat(60));
  console.log(`Duration: ${duration}ms`);
  console.log(`Reviews logged: ${MOCK_REVIEWS.length}`);
  console.log(`  - 5-star from Sarah Thompson (logged only)`);
  console.log(`  - 2-star from Mike Reynolds (logged + Tier 1 notification)`);
  console.log(`Notification ID: ${notification?.id}`);
  console.log(`\nCheck Supabase tables:`);
  console.log(`  - agent_logs: should have 6 new rows`);
  console.log(`  - notification_queue: should have 1 new row (critical priority)`);
}

mockRun()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[GMB Agent Mock] Fatal error:", err);
    process.exit(1);
  });
