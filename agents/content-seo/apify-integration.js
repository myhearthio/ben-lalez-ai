const Apify = require('apify-client');

const client = new Apify.ApifyClient({ token: process.env.APIFY_TOKEN });

async function scrapeInstagram(username, limit = 5) {
  try {
    const run = await client.actor('apify/instagram-scraper').call({
      usernames: [username.replace('@', '')],
      resultsLimit: limit,
    });
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items.map(p => ({
      type: p.type || 'post',
      caption: p.caption || '',
      likes: p.likesCount || 0,
      comments: p.commentsCount || 0,
      hashtags: p.hashtags || [],
      url: p.url || '',
      timestamp: p.timestamp || '',
    }));
  } catch (e) {
    throw new Error(`Instagram scrape failed for ${username}: ${e.message}`);
  }
}

async function scrapeTikTok(username, limit = 5) {
  try {
    const run = await client.actor('apify/tiktok-scraper').call({
      profiles: [username.replace('@', '')],
      resultsPerPage: limit,
    });
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items.map(p => ({
      type: 'video',
      caption: p.text || '',
      likes: p.diggCount || 0,
      comments: p.commentCount || 0,
      shares: p.shareCount || 0,
      hashtags: (p.mentions || []),
      url: p.webVideoUrl || '',
      timestamp: p.createTime || '',
    }));
  } catch (e) {
    throw new Error(`TikTok scrape failed for ${username}: ${e.message}`);
  }
}

async function scrapeReels(username, limit = 5) {
  try {
    const run = await client.actor('apify/instagram-reel-scraper').call({
      username: username.replace('@', ''),
      maxReels: limit,
    });
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items.map(p => ({
      type: 'reel',
      caption: p.caption || '',
      likes: p.likesCount || 0,
      comments: p.commentsCount || 0,
      plays: p.videoPlayCount || 0,
      hashtags: p.hashtags || [],
      url: p.url || '',
      timestamp: p.timestamp || '',
    }));
  } catch (e) {
    throw new Error(`Reels scrape failed for ${username}: ${e.message}`);
  }
}

module.exports = { scrapeInstagram, scrapeTikTok, scrapeReels };
