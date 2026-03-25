import { logAction, publishIntelligence, getRecentIntelligence, getLeadSourceStats, expireOldIntelligence } from "./lib/supabase.js";

export const toolDefinitions = [
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
];

export async function executeTool(name, input) {
  const start = Date.now();
  try {
    let result;
    switch (name) {
      case "web_search": {
        // Uses fetch to a search API — in production, use Serper/SerpAPI
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
          // Fallback: return a note that search is not configured
          result = { note: "Web search not configured — set SERPER_API_KEY for live search", query: input.query };
        }
        await logAction("web_search", "success", { query: input.query }, null, Date.now() - start);
        break;
      }
      case "get_existing_intelligence": result = await getRecentIntelligence(); break;
      case "get_lead_source_stats": result = await getLeadSourceStats(); await logAction("get_lead_stats", "success", { count: result.length }); break;
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
      case "expire_stale_intelligence":
        const expired = await expireOldIntelligence();
        await logAction("expire_intelligence", "success", { expired });
        result = { expired };
        break;
      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { success: true, data: result };
  } catch (err) {
    await logAction(name, "error", { input }, err.message, Date.now() - start);
    return { success: false, error: err.message };
  }
}
