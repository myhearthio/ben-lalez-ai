// ROGER v2.0 — tools.js
// COMPLETE DROP-IN REPLACEMENT for agents/intelligence/tools.js
// Changes: Added 6 new tools (deep_scrape_url, get_brand_memory, read_shared_intelligence,
// publish_strategic_shift, get_nightly_brief_history, get_dataforseo_serp).
// All 8 existing tools preserved exactly.
// New imports: readSharedIntelligence, getBrandMemory from lib/supabase.js

import db, { logAction, publishIntelligence, getRecentIntelligence, getLeadSourceStats, expireOldIntelligence, readSharedIntelligence, getBrandMemory } from "./lib/supabase.js";

export const toolDefinitions = [
  // ============================================
  // EXISTING TOOLS (8) — preserved exactly
  // ============================================
  {
    name: "web_search",
    description: "Search the web for Chicago real estate market data, news, trends, competitor activity, and neighborhood information.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    name: "get_existing_intelligence",
    description: "Fetch existing intelligence to avoid duplicates and build on prior research.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_lead_source_stats",
    description: "Fetch lead source performance data to analyze which channels produce the best leads.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "publish_market_trend",
    description: "Publish a market trend insight for other agents to act on.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" }, insight: { type: "string" },
        confidence: { type: "number" },
        neighborhoods: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
        targetAgents: { type: "array", items: { type: "string" }, description: "Which agents should consume this" },
      },
      required: ["title", "insight", "confidence"],
    },
  },
  {
    name: "publish_competitor_intel",
    description: "Publish competitor intelligence (new listings, pricing strategies, marketing moves).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" }, insight: { type: "string" },
        confidence: { type: "number" }, tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "insight", "confidence"],
    },
  },
  {
    name: "publish_neighborhood_insight",
    description: "Publish neighborhood-specific data (development, events, price changes).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" }, insight: { type: "string" },
        confidence: { type: "number" },
        neighborhoods: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "insight", "confidence", "neighborhoods"],
    },
  },
  {
    name: "publish_seasonal_insight",
    description: "Publish seasonal/timing-based intelligence (best time to list, market cycles).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" }, insight: { type: "string" },
        confidence: { type: "number" }, tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "insight", "confidence"],
    },
  },
  {
    name: "expire_stale_intelligence",
    description: "Clean up expired intelligence entries.",
    input_schema: { type: "object", properties: {} },
  },

  // ============================================
  // NEW v2.0 TOOLS (6)
  // ============================================
  {
    name: "deep_scrape_url",
    description: "Scrape a full web page using Firecrawl API. Use for reading full articles, market reports, data pages, and competitor sites that web_search only returns snippets of. Essential for deep research — you can't do Thompson-level analysis from search snippets alone.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to scrape" },
      },
      required: ["url"],
    },
  },
  {
    name: "get_brand_memory",
    description: "Read brand memory entries — voice rules, approved/rejected phrases, audience definitions. Use before analyzing competitors to understand Ben's positioning and differentiation.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by category: voice, rejected_phrase, audience, voice_rule, approved_phrase, audience_def" },
      },
    },
  },
  {
    name: "read_shared_intelligence",
    description: "Read intelligence from ALL agents in the system — not just your own. Use to check what Oliver has directed, what Sarah is publishing, what other agents have found. Different from get_existing_intelligence which only gets your own recent outputs.",
    input_schema: {
      type: "object",
      properties: {
        source_agent: { type: "string", description: "Filter by source agent name" },
        intelligence_type: { type: "string", description: "Filter by type: market_trend, competitor, neighborhood, seasonal, content_insight, strategic_shift, etc." },
        tags: { type: "array", items: { type: "string" }, description: "Filter by overlapping tags" },
        since: { type: "string", description: "ISO date — only intelligence created after this date" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "publish_strategic_shift",
    description: "Publish a STRATEGIC SHIFT — the highest priority intelligence type. Use ONLY for rare structural changes to the Chicago luxury market that require all agents to adjust strategy. This triggers immediate cross-agent response via Oliver. Examples: major employer HQ relocation, 100+ bps rate move, new transit line approval, major zoning overhaul.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        insight: { type: "string" },
        confidence: { type: "number" },
        neighborhoods: { type: "array", items: { type: "string" } },
        affected_agents: { type: "array", items: { type: "string" }, description: "Which agents need to respond to this shift" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "insight", "confidence", "affected_agents"],
    },
  },
  {
    name: "get_nightly_brief_history",
    description: "Read past Roger nightly briefs to avoid repetition and track how analysis has evolved. Essential for the forecast validation loop — compare past predictions to actual outcomes. Did last week's call hold up?",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of past briefs to retrieve (default 10)" },
      },
    },
  },
  {
    name: "get_dataforseo_serp",
    description: "Get SERP data from DataForSEO — who ranks for key Chicago real estate search terms. Use for competitor SEO analysis and understanding where Ben ranks vs. competitors for high-value keywords.",
    input_schema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Search keyword to analyze" },
        location: { type: "string", description: "Location name (default: Chicago,Illinois,United States)" },
      },
      required: ["keyword"],
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
      case "web_search": {
        const SERPER_KEY = process.env.SERPER_API_KEY;
        if (SERPER_KEY) {
          const res = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ q: input.query, num: 10 }),
          });
          if (!res.ok) throw new Error(`Serper ${res.status}`);
          result = await res.json();
        } else {
          result = { note: "Web search not configured — set SERPER_API_KEY for live search", query: input.query };
        }
        await logAction("web_search", "success", { query: input.query }, null, Date.now() - start);
        break;
      }

      case "get_existing_intelligence":
        result = await getRecentIntelligence();
        break;

      case "get_lead_source_stats":
        result = await getLeadSourceStats();
        await logAction("get_lead_stats", "success", { count: result.length });
        break;

      case "publish_market_trend":
        result = await publishIntelligence({ intelligenceType: "market_trend", title: input.title, insight: input.insight, confidence: input.confidence, neighborhoods: input.neighborhoods, tags: input.tags || [], targetAgents: input.targetAgents });
        await logAction("publish_market_trend", "success", { title: input.title });
        break;

      case "publish_competitor_intel":
        result = await publishIntelligence({ intelligenceType: "competitor", title: input.title, insight: input.insight, confidence: input.confidence, tags: input.tags || [] });
        await logAction("publish_competitor_intel", "success", { title: input.title });
        break;

      case "publish_neighborhood_insight":
        result = await publishIntelligence({ intelligenceType: "neighborhood", title: input.title, insight: input.insight, confidence: input.confidence, neighborhoods: input.neighborhoods, tags: input.tags || [] });
        await logAction("publish_neighborhood_insight", "success", { title: input.title });
        break;

      case "publish_seasonal_insight":
        result = await publishIntelligence({ intelligenceType: "seasonal", title: input.title, insight: input.insight, confidence: input.confidence, tags: input.tags || [] });
        await logAction("publish_seasonal_insight", "success", { title: input.title });
        break;

      case "expire_stale_intelligence": {
        const expired = await expireOldIntelligence();
        await logAction("expire_intelligence", "success", { expired });
        result = { expired };
        break;
      }

      // ============================================
      // NEW v2.0 TOOL IMPLEMENTATIONS (6)
      // ============================================
      case "deep_scrape_url": {
        const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
        if (!FIRECRAWL_KEY) {
          result = { note: "Firecrawl not configured — set FIRECRAWL_API_KEY", url: input.url };
          break;
        }
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${FIRECRAWL_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: input.url,
            formats: ["markdown"],
          }),
        });
        if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
        const data = await res.json();
        result = {
          url: input.url,
          markdown: data.data?.markdown || "",
          title: data.data?.metadata?.title || "",
          description: data.data?.metadata?.description || "",
        };
        await logAction("deep_scrape_url", "success", { url: input.url }, null, Date.now() - start);
        break;
      }

      case "get_brand_memory": {
        result = await getBrandMemory({ category: input.category });
        await logAction("get_brand_memory", "success", { count: result.length });
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

      case "publish_strategic_shift": {
        result = await publishIntelligence({
          intelligenceType: "strategic_shift",
          title: input.title,
          insight: input.insight,
          confidence: input.confidence,
          neighborhoods: input.neighborhoods || [],
          tags: [...(input.tags || []), "strategic_shift", "cross_agent"],
          targetAgents: input.affected_agents,
        });
        await logAction("publish_strategic_shift", "success", {
          title: input.title,
          affected_agents: input.affected_agents,
        });
        break;
      }

      case "get_nightly_brief_history": {
        const { data, error } = await db()
          .from("roger_nightly_brief")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(input.limit || 10);
        if (error) throw new Error(`Nightly brief history: ${error.message}`);
        result = data || [];
        await logAction("get_nightly_brief_history", "success", { count: result.length });
        break;
      }

      case "get_dataforseo_serp": {
        const login = process.env.DATAFORSEO_LOGIN;
        const password = process.env.DATAFORSEO_PASSWORD;
        if (!login || !password) {
          result = { note: "DataForSEO not configured — set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD" };
          break;
        }
        const authHeader = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
        const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([{
            keyword: input.keyword,
            location_name: input.location || "Chicago,Illinois,United States",
            language_name: "English",
            depth: 10,
          }]),
        });
        if (!res.ok) throw new Error(`DataForSEO ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const items = data.tasks?.[0]?.result?.[0]?.items || [];
        result = {
          keyword: input.keyword,
          total_results: data.tasks?.[0]?.result?.[0]?.se_results_count,
          items: items.slice(0, 10).map(i => ({
            rank: i.rank_absolute,
            url: i.url,
            title: i.title,
            description: i.description,
            domain: i.domain,
          })),
        };
        await logAction("get_dataforseo_serp", "success", { keyword: input.keyword, results: items.length });
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
