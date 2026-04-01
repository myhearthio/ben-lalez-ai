const BUFFER_TOKEN = process.env.BUFFER_ACCESS_TOKEN;
const BUFFER_BASE = "https://graph.buffer.com";


async function bufferFetch(path, options = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BUFFER_BASE}${path}${sep}access_token=${BUFFER_TOKEN}`, {
    ...options,
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...options.headers },
  });
  if (!res.ok) throw new Error(`Buffer ${res.status}: ${await res.text()}`);
  return res.json();
}


export async function getProfiles() {
  return bufferFetch("/profiles.json");
}


export async function createUpdate({ profileIds, text, mediaUrl = null, scheduledAt = null }) {
  const body = { profile_ids: profileIds, text, shorten: true };
  if (mediaUrl) body.media = { photo: mediaUrl };
  if (scheduledAt) body.scheduled_at = scheduledAt;


  return bufferFetch("/updates/create.json", {
    method: "POST",
    body: new URLSearchParams(body).toString(),
  });
}


export async function getPendingUpdates(profileId) {
  return bufferFetch(`/profiles/${profileId}/updates/pending.json`);
}

