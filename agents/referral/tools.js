import { logAction, createNotification, getClosedLeads, getReferralCandidates, getAnniversaryClients, getHighValueLeads, updateLeadTouch, publishIntelligence, createAgentTask } from "./lib/supabase.js";

export const toolDefinitions = [
  {
    name: "get_referral_candidates",
    description: "Fetch closed clients who haven't been contacted in 30+ days. These are prime candidates for a referral ask or check-in. Sorted by closing value (highest first).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_anniversary_clients",
    description: "Fetch clients whose home purchase anniversary is within the next 14 days. Anniversary touchpoints are high-conversion referral moments.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_all_closed_clients",
    description: "Fetch all closed clients for analysis. Use this to identify referral patterns or segment the client base.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_referral_leads",
    description: "Fetch active leads that came from referrals. Use this to track referral pipeline health.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_referral_outreach_task",
    description: "Create a task for the Nurture Agent to send a referral-focused email or SMS to a past client.",
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string", description: "UUID of the past client in lead_intelligence" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        outreachType: { type: "string", enum: ["referral_ask", "anniversary", "check_in", "market_update", "holiday"], description: "Type of outreach" },
        suggestedMessage: { type: "string", description: "AI-drafted message for the nurture agent to send" },
        channel: { type: "string", enum: ["email", "sms", "both"], description: "Preferred delivery channel" },
      },
      required: ["leadId", "firstName", "outreachType", "suggestedMessage", "channel"],
    },
  },
  {
    name: "notify_ben_referral_opportunity",
    description: "Alert Ben about a high-value referral opportunity that needs personal attention (e.g., past client with $1M+ closing, well-connected client).",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string" },
        closingValue: { type: "number" },
        reason: { type: "string", description: "Why this client is a high-value referral opportunity" },
        suggestedAction: { type: "string", description: "What Ben should do" },
        leadId: { type: "string" },
      },
      required: ["clientName", "reason", "suggestedAction"],
    },
  },
  {
    name: "record_outreach_touch",
    description: "Record that a referral outreach was initiated for a client. Updates last_touch_at in lead_intelligence.",
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string", description: "UUID of the client" },
      },
      required: ["leadId"],
    },
  },
  {
    name: "publish_referral_insight",
    description: "Publish a referral pattern or insight to shared_intelligence for other agents.",
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
      case "get_referral_candidates": {
        result = await getReferralCandidates();
        await logAction("get_referral_candidates", "success", { count: result.length });
        break;
      }

      case "get_anniversary_clients": {
        result = await getAnniversaryClients();
        await logAction("get_anniversary_clients", "success", { count: result.length });
        break;
      }

      case "get_all_closed_clients": {
        result = await getClosedLeads();
        await logAction("get_all_closed_clients", "success", { count: result.length });
        break;
      }

      case "get_referral_leads": {
        result = await getHighValueLeads();
        await logAction("get_referral_leads", "success", { count: result.length });
        break;
      }

      case "create_referral_outreach_task": {
        const task = await createAgentTask({
          assignedAgent: "nurture_agent",
          taskType: `referral_${input.outreachType}`,
          description: `Send ${input.outreachType} outreach to ${input.firstName} ${input.lastName || ""}`.trim(),
          payload: {
            leadId: input.leadId,
            firstName: input.firstName,
            lastName: input.lastName,
            outreachType: input.outreachType,
            suggestedMessage: input.suggestedMessage,
            channel: input.channel,
          },
          priority: input.outreachType === "referral_ask" ? 3 : 5,
        });

        await updateLeadTouch(input.leadId);

        const duration = Date.now() - start;
        await logAction("create_referral_outreach", "success", {
          leadId: input.leadId,
          outreachType: input.outreachType,
          taskId: task?.id,
        }, null, duration, input.leadId);

        result = { taskId: task?.id, outreachType: input.outreachType };
        break;
      }

      case "notify_ben_referral_opportunity": {
        const notification = await createNotification({
          priority: "high",
          title: `Referral opportunity: ${input.clientName}`,
          message: `${input.reason}\n\nSuggested action: ${input.suggestedAction}${input.closingValue ? `\n\nOriginal closing: $${input.closingValue.toLocaleString()}` : ""}`,
          data: {
            clientName: input.clientName,
            closingValue: input.closingValue,
            reason: input.reason,
            suggestedAction: input.suggestedAction,
            leadId: input.leadId,
          },
          relatedId: input.leadId,
        });

        await logAction("referral_opportunity_alert", "success", {
          clientName: input.clientName,
          notificationId: notification?.id,
        }, null, null, input.leadId);

        result = { notificationId: notification?.id };
        break;
      }

      case "record_outreach_touch": {
        await updateLeadTouch(input.leadId);
        await logAction("record_touch", "success", { leadId: input.leadId }, null, null, input.leadId);
        result = { recorded: true };
        break;
      }

      case "publish_referral_insight": {
        await publishIntelligence({
          title: input.title,
          insight: input.insight,
          intelligenceType: "lead_pattern",
          confidence: input.confidence,
          tags: input.tags || ["referral"],
        });
        await logAction("publish_referral_insight", "success", { title: input.title });
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
