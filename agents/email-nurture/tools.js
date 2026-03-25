import { sendEmail } from "./lib/sendgrid.js";
import { sendSms } from "./lib/twilio-sms.js";
import { findContact, createContact, addContactToAutomation, addTag } from "./lib/activecampaign.js";
import { logAction, getPendingNurtureTasks, claimTask, completeTask, failTask, getLeadsNeedingNurture, getLeadById, updateLeadTouch, getBrandVoice, recordContent } from "./lib/supabase.js";

export const toolDefinitions = [
  {
    name: "get_pending_tasks",
    description: "Fetch pending nurture tasks from agent_tasks (assigned by Referral Agent, Orchestrator, etc).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_leads_needing_nurture",
    description: "Fetch warm/cold leads that haven't been contacted in 3+ days. These need a drip touch.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_lead_details",
    description: "Get full details for a specific lead from lead_intelligence.",
    input_schema: {
      type: "object",
      properties: { leadId: { type: "string" } },
      required: ["leadId"],
    },
  },
  {
    name: "get_brand_voice",
    description: "Fetch brand voice rules and email templates from brand_memory.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "send_nurture_email",
    description: "Send a personalized nurture email via SendGrid. Provide the lead ID, email, subject, and HTML body.",
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string" },
        htmlBody: { type: "string", description: "HTML email body" },
        textBody: { type: "string", description: "Plain text fallback" },
        firstName: { type: "string" },
      },
      required: ["leadId", "to", "subject", "htmlBody"],
    },
  },
  {
    name: "send_nurture_sms",
    description: "Send a personalized nurture SMS via Twilio.",
    input_schema: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        to: { type: "string", description: "Phone number in E.164 format" },
        body: { type: "string", description: "SMS body (keep under 160 chars)" },
        firstName: { type: "string" },
      },
      required: ["leadId", "to", "body"],
    },
  },
  {
    name: "add_to_automation",
    description: "Add a lead to an ActiveCampaign automation sequence.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        phone: { type: "string" },
        automationId: { type: "string", description: "ActiveCampaign automation ID" },
      },
      required: ["email", "automationId"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a nurture task as completed after successfully sending the outreach.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        result: { type: "object", description: "Result data" },
      },
      required: ["taskId"],
    },
  },
];

export async function executeTool(name, input) {
  const start = Date.now();
  try {
    let result;

    switch (name) {
      case "get_pending_tasks": {
        result = await getPendingNurtureTasks();
        await logAction("get_pending_tasks", "success", { count: result.length });
        break;
      }
      case "get_leads_needing_nurture": {
        result = await getLeadsNeedingNurture();
        await logAction("get_leads_needing_nurture", "success", { count: result.length });
        break;
      }
      case "get_lead_details": {
        result = await getLeadById(input.leadId);
        break;
      }
      case "get_brand_voice": {
        result = await getBrandVoice();
        break;
      }
      case "send_nurture_email": {
        const emailResult = await sendEmail({
          to: input.to, subject: input.subject,
          htmlBody: input.htmlBody, textBody: input.textBody,
        });
        await updateLeadTouch(input.leadId, "email");
        await recordContent(input.subject, input.htmlBody, "email");
        await logAction("send_nurture_email", "success", {
          leadId: input.leadId, to: input.to, subject: input.subject,
        }, null, Date.now() - start, input.leadId);
        result = emailResult;
        break;
      }
      case "send_nurture_sms": {
        const smsResult = await sendSms(input.to, input.body);
        await updateLeadTouch(input.leadId, "sms");
        await logAction("send_nurture_sms", "success", {
          leadId: input.leadId, to: input.to, bodyPreview: input.body.substring(0, 50),
        }, null, Date.now() - start, input.leadId);
        result = smsResult;
        break;
      }
      case "add_to_automation": {
        let contact = await findContact(input.email);
        if (!contact) {
          contact = await createContact({
            email: input.email, firstName: input.firstName,
            lastName: input.lastName, phone: input.phone,
          });
        }
        await addContactToAutomation(contact.id, input.automationId);
        await logAction("add_to_automation", "success", {
          email: input.email, automationId: input.automationId,
        });
        result = { contactId: contact.id, automationId: input.automationId };
        break;
      }
      case "complete_task": {
        await completeTask(input.taskId, input.result || {});
        await logAction("complete_task", "success", { taskId: input.taskId });
        result = { completed: true };
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { success: true, data: result };
  } catch (err) {
    await logAction(name, "error", { input }, err.message, Date.now() - start);
    return { success: false, error: err.message };
  }
}
