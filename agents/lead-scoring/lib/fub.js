// Follow Up Boss API client

const FUB_BASE = "https://api.followupboss.com/v1";

async function fubFetch(path, options = {}) {
  const res = await fetch(`${FUB_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(process.env.FOLLOWUPBOSS_API_KEY + ":").toString("base64")}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FUB API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getRecentLeads(limit = 25, offset = 0) {
  const data = await fubFetch(`/people?limit=${limit}&offset=${offset}&sort=created&fields=id,firstName,lastName,emails,phones,source,stage,created,tags,lastActivity`);
  return data.people || [];
}

export async function getLeadById(id) {
  return fubFetch(`/people/${id}`);
}

export async function getLeadActivity(personId, limit = 20) {
  const data = await fubFetch(`/events?personId=${personId}&limit=${limit}&sort=-created`);
  return data.events || [];
}

export async function getLeadNotes(personId) {
  const data = await fubFetch(`/notes?personId=${personId}&limit=10&sort=-created`);
  return data.notes || [];
}
