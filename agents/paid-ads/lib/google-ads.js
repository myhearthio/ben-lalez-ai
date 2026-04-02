// Google Ads API client — uses REST v18
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN;
const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID;

let _accessToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET, refresh_token: REFRESH_TOKEN,
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${await res.text()}`);
  const data = await res.json();
  _accessToken = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _accessToken;
}

async function googleAdsFetch(query) {
  const token = await getAccessToken();
  const res = await fetch(
    `https://googleads.googleapis.com/v18/customers/${CUSTOMER_ID}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": DEVELOPER_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  if (!res.ok) throw new Error(`Google Ads ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getCampaignPerformance(days = 7) {
  const query = `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion FROM campaign WHERE segments.date DURING LAST_${days}_DAYS AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC`;
  return googleAdsFetch(query);
}

export async function getAdGroupPerformance(campaignId, days = 7) {
  const query = `SELECT ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group WHERE campaign.id = ${campaignId} AND segments.date DURING LAST_${days}_DAYS ORDER BY metrics.clicks DESC`;
  return googleAdsFetch(query);
}

export async function getKeywordPerformance(days = 7) {
  const query = `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date DURING LAST_${days}_DAYS ORDER BY metrics.impressions DESC LIMIT 50`;
  return googleAdsFetch(query);
}

export async function updateCampaignBudget(campaignId, budgetAmountMicros) {
  // Budget updates require the mutate endpoint
  const token = await getAccessToken();
  const res = await fetch(
    `https://googleads.googleapis.com/v18/customers/${CUSTOMER_ID}/campaignBudgets:mutate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "developer-token": DEVELOPER_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({
        operations: [{ updateMask: "amountMicros", update: { resourceName: `customers/${CUSTOMER_ID}/campaignBudgets/${campaignId}`, amountMicros: budgetAmountMicros } }],
      }),
    }
  );
  if (!res.ok) throw new Error(`Google Ads Budget ${res.status}: ${await res.text()}`);
  return res.json();
