import * as gads from "./lib/google-ads.js";
import * as meta from "./lib/meta-ads.js";
import { logAction, createNotification, getAdCampaigns, recordCampaign, updateCampaignMetrics, getRecentIntelligence, publishIntelligence } from "./lib/supabase.js";

export const toolDefinitions = [
  { name: "get_google_campaigns", description: "Fetch Google Ads campaign performance for the last N days.", input_schema: { type: "object", properties: { days: { type: "number" } } } },
  { name: "get_google_keywords", description: "Fetch top Google Ads keyword performance.", input_schema: { type: "object", properties: { days: { type: "number" } } } },
  { name: "get_meta_campaigns", description: "Fetch Meta/Facebook ad campaign performance.", input_schema: { type: "object", properties: { days: { type: "number" } } } },
  { name: "get_tracked_campaigns", description: "Fetch campaigns tracked in Supabase content_performance.", input_schema: { type: "object", properties: {} } },
  { name: "get_market_intelligence", description: "Fetch market intelligence from other agents.", input_schema: { type: "object", properties: {} } },
  {
    name: "update_google_budget",
    description: "Update a Google Ads campaign budget. Requires Ben's approval for changes over 20%.",
    input_schema: {
      type: "object",
      properties: {
        campaignId: { type: "string" }, campaignName: { type: "string" },
        newBudgetMicros: { type: "number", description: "New daily budget in micros (1M = $1)" },
        reason: { type: "string" },
      },
      required: ["campaignId", "newBudgetMicros", "reason"],
    },
  },
  {
    name: "update_meta_budget",
    description: "Update a Meta ad set daily budget.",
    input_schema: {
      type: "object",
      properties: {
        adSetId: { type: "string" }, adSetName: { type: "string" },
        dailyBudgetCents: { type: "number", description: "New daily budget in cents" },
        reason: { type: "string" },
      },
      required: ["adSetId", "dailyBudgetCents", "reason"],
    },
  },
  {
    name: "pause_meta_campaign",
    description: "Pause an underperforming Meta campaign.",
    input_schema: { type: "object", properties: { campaignId: { type: "string" }, reason: { type: "string" } }, required: ["campaignId", "reason"] },
  },
  {
    name: "notify_ben_ad_change",
    description: "Alert Ben about a significant ad spend or performance change that needs approval.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" }, message: { type: "string" },
        priority: { type: "string", enum: ["critical", "high", "normal"] },
      },
      required: ["title", "message"],
    },
  },
  {
    name: "record_campaign_metrics",
    description: "Update campaign metrics in Supabase from the latest platform data.",
    input_schema: {
      type: "object",
      properties: {
        supabaseId: { type: "string" },
        impressions: { type: "number" }, clicks: { type: "number" },
        spend: { type: "number" }, conversions: { type: "number" },
        cpc: { type: "number" }, cpl: { type: "number" },
        leads: { type: "number" }, performanceScore: { type: "number" },
      },
      required: ["supabaseId"],
    },
  },
  {
    name: "publish_ad_insight",
    description: "Publish an ads performance insight to shared_intelligence.",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" }, insight: { type: "string" }, confidence: { type: "number" }, tags: { type: "array", items: { type: "string" } } },
      required: ["title", "insight", "confidence"],
    },
  },
];

export async function executeTool(name, input) {
  const start = Date.now();
  try {
    let result;
    switch (name) {
      case "get_google_campaigns": result = await gads.getCampaignPerformance(input.days || 7); await logAction("get_google_campaigns", "success", { days: input.days }); break;
      case "get_google_keywords": result = await gads.getKeywordPerformance(input.days || 7); await logAction("get_google_keywords", "success"); break;
      case "get_meta_campaigns": result = await meta.getCampaignPerformance(input.days || 7); await logAction("get_meta_campaigns", "success", { days: input.days }); break;
      case "get_tracked_campaigns": result = await getAdCampaigns(); await logAction("get_tracked_campaigns", "success", { count: result.length }); break;
      case "get_market_intelligence": result = await getRecentIntelligence(); break;
      case "update_google_budget":
        await gads.updateCampaignBudget(input.campaignId, input.newBudgetMicros);
        await logAction("update_google_budget", "success", input, null, Date.now() - start);
        result = { updated: true };
        break;
      case "update_meta_budget":
        await meta.updateBudget(input.adSetId, input.dailyBudgetCents);
        await logAction("update_meta_budget", "success", input, null, Date.now() - start);
        result = { updated: true };
        break;
      case "pause_meta_campaign":
        await meta.updateCampaignStatus(input.campaignId, "PAUSED");
        await logAction("pause_meta_campaign", "success", input, null, Date.now() - start);
        result = { paused: true };
        break;
      case "notify_ben_ad_change":
        const n = await createNotification({ priority: input.priority || "high", title: input.title, message: input.message, data: input });
        await logAction("notify_ben_ad_change", "success", { notificationId: n?.id });
        result = { notificationId: n?.id };
        break;
      case "record_campaign_metrics":
        await updateCampaignMetrics(input.supabaseId, input);
        await logAction("record_metrics", "success", { id: input.supabaseId });
        result = { updated: true };
        break;
      case "publish_ad_insight":
        await publishIntelligence({ title: input.title, insight: input.insight, confidence: input.confidence, tags: input.tags || [] });
        await logAction("publish_ad_insight", "success", { title: input.title });
        result = { published: true };
        break;
      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { success: true, data: result };
  } catch (err) {
    await logAction(name, "error", { input }, err.message, Date.now() - start);
    return { success: false, error: err.message };
  }
}
