// Meta Marketing API client
const META_BASE = "https://graph.facebook.com/v19.0";
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

async function metaFetch(path) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${META_BASE}${path}${sep}access_token=${ACCESS_TOKEN}`);
  if (!res.ok) throw new Error(`Meta API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getCampaignPerformance(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const until = new Date().toISOString().split("T")[0];
  return metaFetch(`/act_${AD_ACCOUNT_ID}/insights?level=campaign&fields=campaign_id,campaign_name,impressions,clicks,spend,actions,cost_per_action_type,cpc&time_range={"since":"${since}","until":"${until}"}`);
}

export async function getAdSetPerformance(campaignId, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const until = new Date().toISOString().split("T")[0];
  return metaFetch(`/${campaignId}/insights?level=adset&fields=adset_id,adset_name,impressions,clicks,spend,actions,cpc&time_range={"since":"${since}","until":"${until}"}`);
}

export async function updateCampaignStatus(campaignId, status) {
  const res = await fetch(`${META_BASE}/${campaignId}?access_token=${ACCESS_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }), // ACTIVE, PAUSED
  });
  if (!res.ok) throw new Error(`Meta ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function updateBudget(adSetId, dailyBudgetCents) {
  const res = await fetch(`${META_BASE}/${adSetId}?access_token=${ACCESS_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ daily_budget: dailyBudgetCents }),
  });
  if (!res.ok) throw new Error(`Meta Budget ${res.status}: ${await res.text()}`);
  return res.json();
}
