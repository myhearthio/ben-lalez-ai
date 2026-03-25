import { createPost, getRecentPosts } from "./lib/wordpress.js";
import { getProfiles, createUpdate } from "./lib/buffer.js";
import { logAction, getBrandVoice, getRecentIntelligence, getRecentContent, getContentThisWeek, recordContent, publishIntelligence } from "./lib/supabase.js";

export const toolDefinitions = [
  {
    name: "get_brand_voice",
    description: "Fetch brand voice rules, keywords, and templates.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_market_intelligence",
    description: "Fetch recent market insights from other agents to inform content topics.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_recent_content",
    description: "Fetch recently published content to avoid duplicate topics.",
    input_schema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "get_content_count_this_week",
    description: "How many pieces of content have been published this week.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "publish_blog_post",
    description: "Publish a blog post to WordPress. Include SEO-optimized title, full HTML content, and excerpt.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string", description: "Full HTML blog content" },
        excerpt: { type: "string", description: "SEO meta description (under 160 chars)" },
        topics: { type: "array", items: { type: "string" } },
      },
      required: ["title", "content", "excerpt"],
    },
  },
  {
    name: "schedule_social_post",
    description: "Schedule a social media post via Buffer across connected profiles.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Social post text" },
        mediaUrl: { type: "string", description: "Image URL to attach" },
        platforms: { type: "array", items: { type: "string" }, description: "Platform names to post to" },
      },
      required: ["text"],
    },
  },
  {
    name: "get_social_profiles",
    description: "Fetch connected Buffer social profiles to know which platforms are available.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "publish_content_insight",
    description: "Share a content performance insight with other agents.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        insight: { type: "string" },
        confidence: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "insight", "confidence"],
    },
  },
];

export async function executeTool(name, input) {
  const start = Date.now();
  try {
    let result;

    switch (name) {
      case "get_brand_voice": {
        result = await getBrandVoice();
        break;
      }
      case "get_market_intelligence": {
        result = await getRecentIntelligence();
        await logAction("get_intelligence", "success", { count: result.length });
        break;
      }
      case "get_recent_content": {
        result = await getRecentContent(input.limit || 10);
        break;
      }
      case "get_content_count_this_week": {
        const count = await getContentThisWeek();
        result = { count, target: 3 };
        break;
      }
      case "publish_blog_post": {
        const post = await createPost({ title: input.title, content: input.content, excerpt: input.excerpt });
        await recordContent({
          contentType: "blog_post", channel: "wordpress", title: input.title,
          body: input.content, externalId: String(post.id), externalUrl: post.link,
          topics: input.topics || [],
        });
        await logAction("publish_blog_post", "success", {
          postId: post.id, link: post.link, title: input.title,
        }, null, Date.now() - start);
        result = post;
        break;
      }
      case "schedule_social_post": {
        const profiles = await getProfiles();
        let targetProfiles = profiles;
        if (input.platforms) {
          targetProfiles = profiles.filter(p => input.platforms.includes(p.service));
        }
        const profileIds = targetProfiles.map(p => p.id);

        const update = await createUpdate({ profileIds, text: input.text, mediaUrl: input.mediaUrl });
        await recordContent({
          contentType: "social_post", channel: (input.platforms || ["social"]).join(","),
          title: input.text.substring(0, 100), body: input.text,
          externalId: update.updates?.[0]?.id, topics: [],
        });
        await logAction("schedule_social_post", "success", {
          platforms: input.platforms, textPreview: input.text.substring(0, 80),
        }, null, Date.now() - start);
        result = { scheduled: true, profiles: profileIds.length };
        break;
      }
      case "get_social_profiles": {
        result = await getProfiles();
        break;
      }
      case "publish_content_insight": {
        await publishIntelligence({ title: input.title, insight: input.insight, confidence: input.confidence, tags: input.tags || [] });
        await logAction("publish_insight", "success", { title: input.title });
        result = { published: true };
        break;
      }
      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { success: true, data: result };
  } catch (err) {
    await logAction(name, "error", { input }, err.message, Date.now() - start);
    return { success: false, error: err.message };
  }
}
