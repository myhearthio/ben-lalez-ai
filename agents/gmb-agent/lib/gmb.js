// Google My Business post publishing

const GMB_BASE = "https://mybusiness.googleapis.com/v4";

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

export async function createGmbPost({ summary, callToActionType = "LEARN_MORE", callToActionUrl = null, mediaUrl = null }) {
  const accountId = process.env.GMB_ACCOUNT_ID;
  const locationId = process.env.GMB_LOCATION_ID;
  const path = `/accounts/${accountId}/locations/${locationId}/localPosts`;

  const post = {
    languageCode: "en",
    summary,
    topicType: "STANDARD",
  };

  if (callToActionUrl) {
    post.callToAction = {
      actionType: callToActionType,
      url: callToActionUrl,
    };
  }

  if (mediaUrl) {
    post.media = [
      {
        mediaFormat: "PHOTO",
        sourceUrl: mediaUrl,
      },
    ];
  }

  const result = await gmbFetch(path, {
    method: "POST",
    body: JSON.stringify(post),
  });

  return {
    postId: result.name,
    searchUrl: result.searchUrl || null,
    state: result.state,
  };
}

export async function listRecentGmbPosts(limit = 10) {
  const accountId = process.env.GMB_ACCOUNT_ID;
  const locationId = process.env.GMB_LOCATION_ID;
  const path = `/accounts/${accountId}/locations/${locationId}/localPosts?pageSize=${limit}`;

  const data = await gmbFetch(path);
  return (data.localPosts || []).map((p) => ({
    postId: p.name,
    summary: p.summary,
    state: p.state,
    createTime: p.createTime,
    searchUrl: p.searchUrl,
    metrics: p.metrics || null,
  }));
}
