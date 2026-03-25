import { getRecentLeads, getLeadActivity, getLeadNotes } from "./lib/fub.js";
import { logAction, createNotification, getUnscoredLeads, getLeadsForRescoring, updateLeadScore, publishIntelligence } from "./lib/supabase.js";

export const toolDefinitions = [
  {
    name: "get_unscored_leads",
    description: "Fetch leads from lead_intelligence that have no score yet (score is 0 or null). Returns up to 50 leads with all their data.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_leads_for_rescoring",
    description: "Fetch leads that were scored more than 24 hours ago and are still active. Use this to keep scores fresh.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_fub_recent_leads",
    description: "Fetch recent leads directly from Follow Up Boss CRM. Use this to discover new leads not yet in lead_intelligence.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of leads to fetch (default 25)" },
      },
    },
  },
  {
    name: "get_lead_activity",
    description: "Fetch activity history for a specific lead from Follow Up Boss (emails, calls, texts, property views).",
    input_schema: {
      type: "object",
      properties: {
        personId: { type: "number", description: "Follow Up Boss person ID" },
      },
      required: ["personId"],
    },
  },
  {
    name: "get_lead_notes",
    description: "Fetch agent notes for a specific lead from Follow Up Boss.",
    input_schema: {
      type: "object",
      properties: {
        personId: { type: "number", description: "Follow Up Boss person ID" },
      },
      required: ["personId"],
    },
  },
  {
    name: "score_lead",
    description: "Update a lead's score, intent level, predicted timeline, and AI notes in lead_intelligence. Score 0-100. Intent: hot/warm/cold. Timeline: 0-30 days, 30-90 days, 90+ days.",
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string", description: "UUID of the lead in lead_intelligence" },
        score: { type: "number", description: "Lead score 0-100" },
        intentLevel: { type: "string", enum: ["hot", "warm", "cold"], description: "Intent classification" },
        predictedTimeline: { type: "string", enum: ["0-30 days", "30-90 days", "90+ days"], description: "Predicted transaction timeline" },
        aiNotes: { type: "string", description: "Brief AI analysis of why this score was assigned" },
        firstName: { type: "string", description: "Lead's first name (for notification)" },
        lastName: { type: "string", description: "Lead's last name (for notification)" },
        source: { type: "string", description: "Lead source (for notification)" },
      },
      required: ["leadId", "score", "intentLevel", "predictedTimeline", "aiNotes"],
    },
  },
  {
    name: "publish_scoring_insight",
    description: "Publish a pattern or insight discovered during scoring to shared_intelligence so other agents can act on it.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        insight: { type: "string" },
        intelligenceType: { type: "string", enum: ["lead_pattern", "market_trend", "content_insight"] },
        confidence: { type: "number", description: "0.0 to 1.0" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "insight", "intelligenceType", "confidence"],
    },
  },
];

export async function executeTool(name, input) {
  const start = Date.now();
  try {
    let result;

    switch (name) {
      case "get_unscored_leads": {
        result = await getUnscoredLeads();
        await logAction("get_unscored_leads", "success", { count: result.length });
        break;
      }

      case "get_leads_for_rescoring": {
        result = await getLeadsForRescoring();
        await logAction("get_leads_for_rescoring", "success", { count: result.length });
        break;
      }

      case "get_fub_recent_leads": {
        result = await getRecentLeads(input.limit || 25);
        await logAction("get_fub_recent_leads", "success", { count: result.length });
        break;
      }

      case "get_lead_activity": {
        result = await getLeadActivity(input.personId);
        await logAction("get_lead_activity", "success", { personId: input.personId, events: result.length });
        break;
      }

      case "get_lead_notes": {
        result = await getLeadNotes(input.personId);
        await logAction("get_lead_notes", "success", { personId: input.personId, notes: result.length });
        break;
      }

      case "score_lead": {
        const updated = await updateLeadScore(
          input.leadId,
          input.score,
          input.intentLevel,
          input.predictedTimeline,
          input.aiNotes
        );

        const duration = Date.now() - start;
        await logAction("score_lead", "success", {
          leadId: input.leadId,
          score: input.score,
          intentLevel: input.intentLevel,
          predictedTimeline: input.predictedTimeline,
        }, null, duration, input.leadId);

        // SMS Ben immediately for hot leads (score 80+)
        if (input.score >= 80) {
          const leadName = [input.firstName, input.lastName].filter(Boolean).join(" ") || "Unknown";
          const notification = await createNotification({
            priority: "critical",
            title: `HOT LEAD: ${leadName} scored ${input.score}/100`,
            message: `${leadName} (source: ${input.source || "unknown"}) just scored ${input.score}/100.\n\nIntent: ${input.intentLevel}\nTimeline: ${input.predictedTimeline}\n\nAI Notes: ${input.aiNotes}`,
            data: {
              leadId: input.leadId,
              score: input.score,
              intentLevel: input.intentLevel,
              firstName: input.firstName,
              lastName: input.lastName,
              source: input.source,
            },
            relatedId: input.leadId,
          });

          await logAction("hot_lead_alert", "success", {
            leadId: input.leadId,
            score: input.score,
            notificationId: notification?.id,
          }, null, null, input.leadId);

          result = { updated, hotLeadAlert: true, notificationId: notification?.id };
        } else {
          result = { updated, hotLeadAlert: false };
        }
        break;
      }

      case "publish_scoring_insight": {
        await publishIntelligence({
          title: input.title,
          insight: input.insight,
          intelligenceType: input.intelligenceType,
          confidence: input.confidence,
          tags: input.tags || [],
        });
        await logAction("publish_insight", "success", { title: input.title });
        result = { published: true };
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
