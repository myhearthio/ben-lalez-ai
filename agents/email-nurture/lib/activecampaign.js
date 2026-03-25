const AC_URL = process.env.ACTIVECAMPAIGN_API_URL;
const AC_KEY = process.env.ACTIVECAMPAIGN_API_KEY;

async function acFetch(path, options = {}) {
  const res = await fetch(`${AC_URL}/api/3${path}`, {
    ...options,
    headers: { "Api-Token": AC_KEY, "Content-Type": "application/json", ...options.headers },
  });
  if (!res.ok) throw new Error(`ActiveCampaign ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function findContact(email) {
  const data = await acFetch(`/contacts?email=${encodeURIComponent(email)}`);
  return data.contacts?.[0] || null;
}

export async function createContact({ email, firstName, lastName, phone }) {
  const data = await acFetch("/contacts", {
    method: "POST",
    body: JSON.stringify({ contact: { email, firstName, lastName, phone } }),
  });
  return data.contact;
}

export async function addContactToAutomation(contactId, automationId) {
  await acFetch("/contactAutomations", {
    method: "POST",
    body: JSON.stringify({ contactAutomation: { contact: contactId, automation: automationId } }),
  });
}

export async function addTag(contactId, tagId) {
  await acFetch("/contactTags", {
    method: "POST",
    body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } }),
  });
}

export async function sendCampaignEmail(contactId, { subject, body, fromName = "Ben Lalez", fromEmail }) {
  // AC doesn't have a direct single-send API — use a 1:1 email via the deals/contacts system
  // For single sends, we use SendGrid. This function manages automations.
  return { method: "automation", contactId };
}
