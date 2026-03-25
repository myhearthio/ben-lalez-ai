import { fetchGoogleReviews, fetchZillowReviews, fetchFacebookReviews, replyToGoogleReview } from "./lib/reviews.js";
import { createGmbPost, listRecentGmbPosts } from "./lib/gmb.js";
import { logAction, createNotification, getBrandVoice, getLastReviewCheckTime, getGmbPostsThisWeek, getLastGmbPostTime, recordGmbPost, getRecentIntelligence } from "./lib/supabase.js";

// Tool definitions for the Claude Agent SDK
export const toolDefinitions = [
  {
    name: "check_reviews",
    description: "Check for new reviews on a specific platform (google, zillow, or facebook). Returns an array of new reviews since last check.",
    input_schema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: ["google", "zillow", "facebook"],
          description: "Which platform to check for reviews",
        },
      },
      required: ["platform"],
    },
  },
  {
    name: "log_reviews",
    description: "Log a batch of reviews to Supabase agent_logs. Call this after checking reviews on each platform.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", description: "The review platform" },
        reviews: {
          type: "array",
          items: {
            type: "object",
            properties: {
              reviewId: { type: "string" },
              author: { type: "string" },
              rating: { type: "number" },
              text: { type: "string" },
              createdAt: { type: "string" },
            },
          },
          description: "Array of reviews to log",
        },
      },
      required: ["platform", "reviews"],
    },
  },
  {
    name: "create_negative_review_notification",
    description: "Create a Tier 1 (critical) notification for a 1-3 star review, including a drafted response for Ben to approve. Use this for every review rated 1-3 stars.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", description: "Where the review was posted" },
        reviewId: { type: "string" },
        author: { type: "string" },
        rating: { type: "number" },
        reviewText: { type: "string" },
        draftedResponse: { type: "string", description: "Your professionally drafted response for Ben to review and approve" },
      },
      required: ["platform", "reviewId", "author", "rating", "reviewText", "draftedResponse"],
    },
  },
  {
    name: "get_brand_voice",
    description: "Retrieve brand voice rules and templates from brand_memory. Use this before drafting review responses or GMB posts to stay on-brand.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_posting_status",
    description: "Check how many GMB posts have been published this week and when the last post was made. Use this to decide if a new post is needed to meet the 3x/week target.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_market_intelligence",
    description: "Fetch recent shared intelligence from other agents (market trends, neighborhood data, content insights). Use this to inform GMB post topics.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "publish_gmb_post",
    description: "Publish a post to Google My Business. Use this to create update posts about the team, market insights, listings, or community content.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "The post body text (max 1500 chars)" },
        callToActionType: {
          type: "string",
          enum: ["BOOK", "ORDER", "LEARN_MORE", "SIGN_UP", "CALL"],
          description: "Type of CTA button",
        },
        callToActionUrl: { type: "string", description: "URL for the CTA button" },
        mediaUrl: { type: "string", description: "URL of an image to include" },
      },
      required: ["summary"],
    },
  },
  {
    name: "list_recent_gmb_posts",
    description: "List recent GMB posts to review what has already been published and avoid duplicate topics.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of posts to retrieve (default 10)" },
      },
    },
  },
  {
    name: "reply_to_google_review",
    description: "Post a reply to a Google review. Only use this after Ben has approved the response via notification_queue.",
    input_schema: {
      type: "object",
      properties: {
        reviewId: { type: "string", description: "The Google review ID" },
        replyText: { type: "string", description: "The approved reply text" },
      },
      required: ["reviewId", "replyText"],
    },
  },
];

// Tool execution handler
export async function executeTool(name, input) {
  const start = Date.now();

  try {
    let result;

    switch (name) {
      case "check_reviews": {
        const sinceDate = await getLastReviewCheckTime(input.platform);
        const fetcher = {
          google: fetchGoogleReviews,
          zillow: fetchZillowReviews,
          facebook: fetchFacebookReviews,
        }[input.platform];

        result = await fetcher(sinceDate);
        const duration = Date.now() - start;
        await logAction(`check_${input.platform}_reviews`, "success", {
          platform: input.platform,
          reviewCount: result.length,
          sinceDate,
        }, null, duration);
        break;
      }

      case "log_reviews": {
        for (const review of input.reviews) {
          await logAction("review_found", "success", {
            platform: input.platform,
            reviewId: review.reviewId,
            author: review.author,
            rating: review.rating,
            text: review.text,
            createdAt: review.createdAt,
          });
        }
        result = { logged: input.reviews.length };
        break;
      }

      case "create_negative_review_notification": {
        const notification = await createNotification({
          notificationType: "approval_required",
          priority: "critical",
          title: `Negative ${input.rating}-star review on ${input.platform} from ${input.author}`,
          message: `Review: "${input.reviewText}"\n\nDrafted response:\n"${input.draftedResponse}"`,
          data: {
            platform: input.platform,
            reviewId: input.reviewId,
            author: input.author,
            rating: input.rating,
            reviewText: input.reviewText,
            draftedResponse: input.draftedResponse,
          },
          channel: "sms",
        });

        await logAction("negative_review_notification", "success", {
          platform: input.platform,
          reviewId: input.reviewId,
          rating: input.rating,
          notificationId: notification?.id,
        });

        result = { notificationId: notification?.id, status: "sent" };
        break;
      }

      case "get_brand_voice": {
        result = await getBrandVoice();
        break;
      }

      case "get_posting_status": {
        const postsThisWeek = await getGmbPostsThisWeek();
        const lastPostTime = await getLastGmbPostTime();
        result = {
          postsThisWeek,
          targetPerWeek: 3,
          remainingThisWeek: Math.max(0, 3 - postsThisWeek),
          lastPostAt: lastPostTime,
        };
        break;
      }

      case "get_market_intelligence": {
        result = await getRecentIntelligence();
        break;
      }

      case "publish_gmb_post": {
        const postResult = await createGmbPost({
          summary: input.summary,
          callToActionType: input.callToActionType,
          callToActionUrl: input.callToActionUrl,
          mediaUrl: input.mediaUrl,
        });

        await recordGmbPost(
          input.summary.substring(0, 100),
          input.summary,
          postResult.postId,
          postResult.searchUrl
        );

        const duration = Date.now() - start;
        await logAction("publish_gmb_post", "success", {
          postId: postResult.postId,
          summaryPreview: input.summary.substring(0, 100),
          hasMedia: !!input.mediaUrl,
          hasCta: !!input.callToActionUrl,
        }, null, duration);

        result = postResult;
        break;
      }

      case "list_recent_gmb_posts": {
        result = await listRecentGmbPosts(input.limit || 10);
        break;
      }

      case "reply_to_google_review": {
        await replyToGoogleReview(input.reviewId, input.replyText);
        const duration = Date.now() - start;
        await logAction("reply_to_review", "success", {
          reviewId: input.reviewId,
          replyPreview: input.replyText.substring(0, 200),
        }, null, duration);
        result = { status: "replied", reviewId: input.reviewId };
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { success: true, data: result };
  } catch (err) {
    const duration = Date.now() - start;
    await logAction(name, "error", { input }, err.message, duration);
    return { success: false, error: err.message };
  }
}
