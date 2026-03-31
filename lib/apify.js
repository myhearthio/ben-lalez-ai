if (!process.env.APIFY_TOKEN) throw new Error('Missing APIFY_TOKEN');

const APIFY_BASE = 'https://api.apify.com/v2';
const TOKEN = process.env.APIFY_TOKEN;

export async function runActor(actorId, input, timeoutSecs = 300) {
  const runUrl = `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items` +
    `?token=${TOKEN}&timeout=${timeoutSecs}&memory=256&maxItems=50`;
  const res = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify actor ${actorId} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const items = await res.json();
  return Array.isArray(items) ? items : [];
}

export async function scrapeInstagram(handles, resultsPerProfile = 10) {
  return runActor('apify/instagram-scraper', {
    directUrls: handles.map(h => `https://www.instagram.com/${h}/`),
    resultsType: 'posts',
    resultsLimit: resultsPerProfile,
    addParentData: false,
  });
}

export async function scrapeInstagramReels(handles, resultsPerProfile = 10) {
  return runActor('apify/instagram-reel-scraper', {
    directUrls: handles.map(h => `https://www.instagram.com/${h}/reels/`),
    resultsLimit: resultsPerProfile,
  });
}

export async function scrapeTikTok(handles, resultsPerProfile = 10) {
  return runActor('apify/tiktok-scraper', {
    profiles: handles.map(h => `https://www.tiktok.com/@${h}`),
    resultsPerPage: resultsPerProfile,
    scrapeType: 'user',
  });
}
