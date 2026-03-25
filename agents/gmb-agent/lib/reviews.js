// Review monitoring for Google, Zillow, and Facebook

const GMB_BASE = "https://mybusiness.googleapis.com/v4";
const GRAPH_BASE = "https://graph.facebook.com/v19.0";

async function gmbFetch(path, options = {}) {
  const res = await fetch(`${GMB_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GMB_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GMB API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchGoogleReviews(sinceDate = null) {
  const accountId = process.env.GMB_ACCOUNT_ID;
  const locationId = process.env.GMB_LOCATION_ID;
  const path = `/accounts/${accountId}/locations/${locationId}/reviews`;

  const data = await gmbFetch(path);
  let reviews = (data.reviews || []).map((r) => ({
    platform: "google",
    reviewId: r.reviewId,
    author: r.reviewer?.displayName || "Anonymous",
    rating: r.starRating === "ONE" ? 1
      : r.starRating === "TWO" ? 2
      : r.starRating === "THREE" ? 3
      : r.starRating === "FOUR" ? 4
      : r.starRating === "FIVE" ? 5
      : 0,
    text: r.comment || "",
    createdAt: r.createTime,
    hasReply: !!r.reviewReply,
  }));

  if (sinceDate) {
    const since = new Date(sinceDate);
    reviews = reviews.filter((r) => new Date(r.createdAt) > since);
  }

  return reviews;
}

export async function replyToGoogleReview(reviewId, replyText) {
  const accountId = process.env.GMB_ACCOUNT_ID;
  const locationId = process.env.GMB_LOCATION_ID;
  const path = `/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`;

  return gmbFetch(path, {
    method: "PUT",
    body: JSON.stringify({ comment: replyText }),
  });
}

export async function fetchZillowReviews(sinceDate = null) {
  const screenName = process.env.ZILLOW_SCREEN_NAME;
  const zwsId = process.env.ZILLOW_ZWS_ID;

  const url = `https://www.zillow.com/webservice/ProReviews.htm?zws-id=${encodeURIComponent(zwsId)}&screenname=${encodeURIComponent(screenName)}&output=json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Zillow API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const proReviews = data?.response?.result?.proReviews?.review || [];

  let reviews = proReviews.map((r, i) => ({
    platform: "zillow",
    reviewId: `zillow_${screenName}_${i}_${r.reviewDate}`,
    author: r.reviewer || "Anonymous",
    rating: parseInt(r.rating, 10) || 0,
    text: r.description || "",
    createdAt: r.reviewDate,
    hasReply: false,
  }));

  if (sinceDate) {
    const since = new Date(sinceDate);
    reviews = reviews.filter((r) => new Date(r.createdAt) > since);
  }

  return reviews;
}

export async function fetchFacebookReviews(sinceDate = null) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  const url = `${GRAPH_BASE}/${pageId}/ratings?access_token=${encodeURIComponent(accessToken)}&fields=reviewer,rating,review_text,created_time`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Facebook API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();

  let reviews = (data.data || []).map((r) => ({
    platform: "facebook",
    reviewId: r.id || `fb_${r.created_time}`,
    author: r.reviewer?.name || "Anonymous",
    rating: r.rating || 0,
    text: r.review_text || "",
    createdAt: r.created_time,
    hasReply: false,
  }));

  if (sinceDate) {
    const since = new Date(sinceDate);
    reviews = reviews.filter((r) => new Date(r.createdAt) > since);
  }

  return reviews;
}
