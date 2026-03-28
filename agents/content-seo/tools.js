// SARAH v2.0 — tools.js
// COMPLETE DROP-IN REPLACEMENT for agents/content-seo/tools.js
// Changes: Added 5 new tools (get_content_calendar, update_content_calendar,
// read_shared_intelligence, generate_filming_brief, get_seo_keywords).
// All 8 existing tools preserved exactly.
// New imports: readSharedIntelligence, getContentCalendar, updateContentCalendar, getBrandMemory from lib/supabase.js

import { createPost, getRecentPosts } from "./lib/wordpress.js";
import { getProfiles, createUpdate } from "./lib/buffer.js";
import { logAction, getBrandVoice, getRecentIntelligence, getRecentContent, getContentThisWeek, recordContent, publishIntelligence, readSharedIntelligence, getContentCalendar, updateContentCalendar, getBrandMemory } from "./lib/supabase.js";

export const toolDefinitions = [
  // ============================================
  // EXISTING TOOLS (8) — preserved exactly
  // ============================================
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

  // ============================================
  // NEW v2.0 TOOLS (5)
  // ============================================
  {
    name: "get_content_calendar",
    description: "Read the content calendar to see what's PLANNED — scheduled pieces, overdue items, and execution status. This is different from get_recent_content which shows what was PUBLISHED. Use to know what to create next and track execution vs. plan. Content calendar uses 'headline' (not title) and 'publish_date'.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter: draft, scheduled, published, overdue" },
        assigned_agent: { type: "string", description: "Filter by assigned agent" },
        start_date: { type: "string", description: "ISO date — items on or after" },
        end_date: { type: "string", description: "ISO date — items on or before" },
      },
    },
  },
  {
    name: "update_content_calendar",
    description: "Update a content calendar item — mark as published, change status, add the published URL. Call this after successfully publishing any content that was on the calendar.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Content calendar item UUID" },
        status: { type: "string", enum: ["draft", "in_progress", "review", "scheduled", "published"] },
        external_url: { type: "string", description: "URL of published content" },
      },
      required: ["id", "status"],
    },
  },
  {
    name: "read_shared_intelligence",
    description: "Read intelligence from ALL agents with filters — especially Roger's market intelligence for timely content angles. Use when checking for high-confidence insights (>= 0.8) that should become immediate content. Filter by source, type, recency, or tags.",
    input_schema: {
      type: "object",
      properties: {
        source_agent: { type: "string", description: "Filter by source: intelligence, orchestrator, etc." },
        intelligence_type: { type: "string", description: "Filter by type: market_trend, competitor, neighborhood, seasonal, strategic_shift" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by overlapping tags" },
        since: { type: "string", description: "ISO date — only intelligence after this date" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "generate_filming_brief",
    description: "Generate and save a filming brief for Ben's Thursday content session. Includes location, Content Matrix position, key moments to capture, pre-written hooks, talking points with data, platform destinations, b-roll needs, and estimated output count. Saved to shared_intelligence for Oliver and Ben to review.",
    input_schema: {
      type: "object",
      properties: {
        filming_date: { type: "string", description: "ISO date for the filming session" },
        location: { type: "string", description: "Where to film and why" },
        content_matrix_position: { type: "string", description: "Which Content Matrix quadrant (e.g., Educational x Market Expertise)" },
        key_moments: {
          type: "array",
          items: { type: "string" },
          description: "3-5 specific moments to capture (not a script — real moments)",
        },
        hooks: {
          type: "array",
          items: { type: "string" },
          description: "Pre-written opening hooks for each potential clip",
        },
        talking_points: {
          type: "array",
          items: { type: "string" },
          description: "3-5 data points or insights Ben should mention naturally",
        },
        platform_destinations: {
          type: "object",
          description: "Which clips go to which platforms (e.g., { youtube: 'Full tour', tiktok: 'Hook clips', instagram: 'Reels' })",
        },
        broll_needs: {
          type: "array",
          items: { type: "string" },
          description: "Architecture details, neighborhood ambiance, lifestyle shots",
        },
        estimated_output: { type: "string", description: "How many pieces this session should yield" },
      },
      required: ["filming_date", "location", "key_moments", "hooks"],
    },
  },
  {
    name: "get_seo_keywords",
    description: "Research keyword data using DataForSEO — search volume, difficulty, competition, CPC. Essential for topic cluster strategy: which pillar keywords to target, which clusters to build, and content prioritization by SEO potential.",
    input_schema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Keywords to research (up to 5)",
        },
        location: { type: "string", description: "Location (default: Chicago,Illinois,United States)" },
      },
      required: ["keywords"],
    },
  },
];

export async function executeTool(name, input) {
  const start = Date.now();
  try {
    let result;
    switch (name) {
      // ============================================
      // EXISTING TOOL IMPLEMENTATIONS (preserved exactly)
      // ============================================
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

      // ============================================
      // NEW v2.0 TOOL IMPLEMENTATIONS (5)
      // ============================================
      case "get_content_calendar": {
        result = await getContentCalendar({
          status: input.status,
          assignedAgent: input.assigned_agent,
          startDate: input.start_date,
          endDate: input.end_date,
        });
        await logAction("get_content_calendar", "success", { count: result.length });
        break;
      }

      case "update_content_calendar": {
        result = await updateContentCalendar({
          id: input.id,
          status: input.status,
          externalUrl: input.external_url,
        });
        await logAction("update_content_calendar", "success", { id: input.id, status: input.status });
        break;
      }

      case "read_shared_intelligence": {
        result = await readSharedIntelligence({
          sourceAgent: input.source_agent,
          intelligenceType: input.intelligence_type,
          tags: input.tags,
          since: input.since,
          limit: input.limit || 20,
        });
        await logAction("read_shared_intelligence", "success", { count: result.length });
        break;
      }

      case "generate_filming_brief": {
        const brief = {
          filming_date: input.filming_date,
          location: input.location,
          content_matrix_position: input.content_matrix_position,
          key_moments: input.key_moments,
          hooks: input.hooks,
          talking_points: input.talking_points,
          platform_destinations: input.platform_destinations,
          broll_needs: input.broll_needs,
          estimated_output: input.estimated_output,
        };

        const briefText = `## Filming Brief — ${input.filming_date}

**Location**: ${input.location}
**Content Matrix**: ${input.content_matrix_position || 'TBD'}

### Key Moments to Capture
${(input.key_moments || []).map((m, i) => `${i + 1}. ${m}`).join('\n')}

### Hooks (Pre-Written)
${(input.hooks || []).map((h, i) => `${i + 1}. "${h}"`).join('\n')}

### Talking Points
${(input.talking_points || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}

### B-Roll Needs
${(input.broll_needs || []).map(b => `- ${b}`).join('\n')}

### Estimated Output
${input.estimated_output || 'TBD'}`;

        result = await publishIntelligence({
          intelligenceType: "filming_brief",
          title: `Filming Brief — ${input.filming_date} — ${input.location}`,
          insight: briefText,
          confidence: 0.9,
          tags: ["filming_brief", "content_production", "thursday_session"],
          targetAgents: ["content-seo", "orchestrator"],
          data: brief,
        });
        await logAction("generate_filming_brief", "success", { date: input.filming_date, location: input.location });
        break;
      }

      case "get_seo_keywords": {
        const login = process.env.DATAFORSEO_LOGIN;
        const password = process.env.DATAFORSEO_PASSWORD;
        if (!login || !password) {
          result = { note: "DataForSEO not configured — set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD" };
          break;
        }
        const authHeader = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");

        const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([{
            keywords: input.keywords.slice(0, 5),
            location_name: input.location || "Chicago,Illinois,United States",
            language_name: "English",
          }]),
        });
        if (!res.ok) throw new Error(`DataForSEO ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const items = data.tasks?.[0]?.result || [];
        result = {
          keywords: items.map(i => ({
            keyword: i.keyword,
            search_volume: i.search_volume,
            competition: i.competition,
            competition_index: i.competition_index,
            cpc: i.cpc,
            monthly_searches: i.monthly_searches,
          })),
        };
        await logAction("get_seo_keywords", "success", { keywords: input.keywords, results: items.length });
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
