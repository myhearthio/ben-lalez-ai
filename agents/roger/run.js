import { supabase, log, emitEvent } from '../../lib/supabase.js';
import { callClaude, callClaudeJSON } from '../../lib/claude.js';
import { scrapeInstagram, scrapeInstagramReels, scrapeTikTok } from '../../lib/apify.js';

const AGENT = 'roger';
const start = Date.now();

const INSTAGRAM_HANDLES = ['jonathanmylnarealtor','thechicagorealtors','mikesimonsen','lance_lambert','ryanserhant'];
const TIKTOK_HANDLES = ['ryanserhant','glenngomedoutloud','realestatetiktok'];
const REELS_HANDLES = ['jonathanmylnarealtor','ryanserhant','thechicagorealtors'];

function engagementRate(item) {
  const followers = item.followersCount || item.authorStats?.followerCount || 1;
  const eng = (item.likesCount || item.diggCount || 0) + (item.commentsCount || 0) + (item.sharesCount || item.shareCount || 0);
  return followers > 0 ? parseFloat((eng / followers * 100).toFixed(4)) : 0;
}

function normalizePost(item, platform) {
  return {
    platform,
    url: item.url || (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : null),
    handle: item.ownerUsername || item.authorMeta?.name || item.username || 'unknown',
    followers: item.followersCount || item.authorStats?.followerCount || null,
    caption: (item.caption || item.text || item.description || '').slice(0, 1000),
    likes: item.likesCount || item.diggCount || 0,
    comments: item.commentsCount || 0,
    shares: item.sharesCount || item.shareCount || 0,
    saves: item.savesCount || item.collectCount || 0,
    views: item.videoViewCount || item.playCount || item.videoPlayCount || null,
    postedAt: item.timestamp || (item.createTime ? new Date(item.createTime * 1000).toISOString() : null),
  };
}

async function scrapeAllPlatforms() {
  console.log('[roger] Scraping creators...');
  const results = await Promise.allSettled([
    scrapeInstagram(INSTAGRAM_HANDLES, 10).then(r => r.map(p => normalizePost(p, 'instagram'))),
    scrapeInstagramReels(REELS_HANDLES, 10).then(r => r.map(p => normalizePost(p, 'instagram_reels'))),
    scrapeTikTok(TIKTOK_HANDLES, 10).then(r => r.map(p => normalizePost(p, 'tiktok'))),
  ]);
  const posts = [];
  for (const r of results) {
    if (r.status === 'fulfilled') posts.push(...r.value);
    else console.warn('[roger] Scrape partial failure:', r.reason?.message);
  }
  console.log(`[roger] Scraped ${posts.length} posts`);
  return posts;
}

const ANALYSIS_SYSTEM = `You are Roger, intelligence analyst for Ben Lalez Team. Analyze a social media post and return ONLY valid JSON:
{
  "topic": "string",
  "hook_verbatim": "string",
  "hook_type": "question|stat|story|controversy|prediction|how_to|listicle|none",
  "hook_word_count": number,
  "emotional_trigger": "fear|greed|aspiration|curiosity|social_proof|urgency|none",
  "format_structure": "string",
  "visual_style": "minimal|polished|raw|branded|text-heavy",
  "caption_length": "short|medium|long",
  "cta_type": "comment|dm|link_in_bio|save|share|follow|none",
  "audio_type": "original_audio|trending_sound|voiceover|silent",
  "why_it_worked": "string",
  "key_pattern": "string",
  "what_audience_responded_to": "string or null",
  "ben_lalez_hook": "string",
  "ben_lalez_angle": "string",
  "ben_lalez_script_outline": "string or null",
  "adaptation_confidence": "high|medium|low",
  "performance_tier": "viral|strong|average|weak",
  "relevance_to_ben": number,
  "priority_to_adapt": "this_week|this_month|archive"
}`;

async function analyzePost(post) {
  const er = engagementRate(post);
  const prompt = `Platform: ${post.platform}\nCreator: @${post.handle} (${post.followers?.toLocaleString() ?? 'unknown'} followers)\nCaption: ${post.caption || '[none]'}\nStats: ${post.likes} likes | ${post.comments} comments | ${post.shares} shares | ${post.saves} saves | ${post.views ?? 'N/A'} views\nEngagement rate: ${er}%\nURL: ${post.url || 'N/A'}\n\nAnalyze and return JSON.`;
  try {
    return { ...(await callClaudeJSON(ANALYSIS_SYSTEM, prompt, 'haiku', 1000)), post };
  } catch (err) {
    console.warn(`[roger] Analysis failed for ${post.url}:`, err.message);
    return null;
  }
}

async function writeCreatorIntelligence(post, analysis) {
  const er = engagementRate(post);
  const { error } = await supabase.from('creator_content_intelligence').insert({
    creator_handle: post.handle,
    creator_platform: post.platform,
    creator_market: 'national',
    creator_follower_count: post.followers ?? null,
    creator_niche: 'real_estate',
    is_real_estate: true,
    content_url: post.url ?? null,
    content_type: post.platform.includes('reel') || post.platform === 'tiktok' ? 'video' : 'post',
    posted_at: post.postedAt ?? null,
    topic: analysis.topic,
    view_count: post.views ?? 0,
    like_count: post.likes ?? 0,
    comment_count: post.comments ?? 0,
    share_count: post.shares ?? 0,
    save_count: post.saves ?? 0,
    engagement_rate: er,
    estimated_reach: post.views ?? null,
    hook_verbatim: analysis.hook_verbatim || 'N/A',
    hook_type: analysis.hook_type ?? null,
    hook_word_count: analysis.hook_word_count ?? null,
    emotional_trigger: analysis.emotional_trigger ?? null,
    format_structure: analysis.format_structure ?? null,
    visual_style: analysis.visual_style ?? null,
    caption_length: analysis.caption_length ?? null,
    cta_type: analysis.cta_type ?? null,
    posting_day: post.postedAt ? new Date(post.postedAt).toLocaleDateString('en-US', { weekday: 'long' }) : null,
    audio_type: analysis.audio_type ?? null,
    why_it_worked: analysis.why_it_worked || 'Insufficient data',
    key_pattern: analysis.key_pattern || 'unknown',
    what_audience_responded_to: analysis.what_audience_responded_to ?? null,
    ben_lalez_hook: analysis.ben_lalez_hook || '',
    ben_lalez_angle: analysis.ben_lalez_angle || '',
    ben_lalez_script_outline: analysis.ben_lalez_script_outline ?? null,
    adaptation_confidence: analysis.adaptation_confidence ?? 'medium',
    ready_to_produce: analysis.adaptation_confidence === 'high',
    performance_tier: analysis.performance_tier ?? null,
    relevance_to_ben: analysis.relevance_to_ben ?? 0.5,
    priority_to_adapt: analysis.priority_to_adapt ?? 'this_week',
  });
  if (error) console.error('[roger] creator_content_intelligence error:', error.message);
  return !error;
}

const BRIEF_SYSTEM = `You are Roger. Write the nightly brief. Return ONLY valid JSON:
{
  "top_content_pattern_today": "string",
  "hook_to_use_immediately": "string",
  "format_to_kill": "string",
  "competitor_move_this_week": "string or null",
  "gap_to_exploit": "string",
  "threat_to_watch": "string",
  "top_buyer_question_this_week": "string",
  "top_seller_question_this_week": "string",
  "emerging_search_trend": "string",
  "seo_agent_priority": "string",
  "social_agent_priority": "string",
  "llm_agent_priority": "string",
  "email_agent_priority": "string",
  "gmb_agent_priority": "string",
  "tactics_to_kill": ["string"],
  "kill_evidence": "string",
  "needs_immediate_attention": boolean,
  "immediate_attention_reason": "string or null",
  "confidence_in_brief": "high|medium|low",
  "ai_edge_summary": "string",
  "years_ahead_local": "string",
  "years_ahead_regional": "string",
  "years_ahead_national": "string",
  "years_ahead_international": "string"
}`;

async function composeBrief(analyses) {
  const top = analyses.filter(a => a && (a.adaptation_confidence === 'high' || a.performance_tier === 'viral')).slice(0, 15);
  const summary = top.map(a => `[${a.post.platform}] @${a.post.handle}: "${a.hook_verbatim}" | pattern: ${a.key_pattern} | why: ${a.why_it_worked} | Ben angle: ${a.ben_lalez_angle}`).join('\n');
  const prompt = `Tonight's analyzed content (${analyses.length} total, ${top.length} high-priority):\n\n${summary || 'No high-priority posts.'}\n\nDate: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\nWrite the nightly brief JSON.`;
  return callClaudeJSON(BRIEF_SYSTEM, prompt, 'haiku', 1500);
}

async function writeBrief(brief, newHooks, newPatterns) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.from('roger_nightly_brief').insert({
    brief_date: today,
    top_content_pattern_today: brief.top_content_pattern_today ?? null,
    hook_to_use_immediately: brief.hook_to_use_immediately ?? null,
    format_to_kill: brief.format_to_kill ?? null,
    new_hooks_added: newHooks,
    new_patterns_validated: newPatterns,
    competitor_move_this_week: brief.competitor_move_this_week ?? null,
    gap_to_exploit: brief.gap_to_exploit ?? null,
    threat_to_watch: brief.threat_to_watch ?? null,
    top_buyer_question_this_week: brief.top_buyer_question_this_week ?? null,
    top_seller_question_this_week: brief.top_seller_question_this_week ?? null,
    emerging_search_trend: brief.emerging_search_trend ?? null,
    seo_agent_priority: brief.seo_agent_priority ?? null,
    social_agent_priority: brief.social_agent_priority ?? null,
    llm_agent_priority: brief.llm_agent_priority ?? null,
    email_agent_priority: brief.email_agent_priority ?? null,
    gmb_agent_priority: brief.gmb_agent_priority ?? null,
    tactics_to_kill: brief.tactics_to_kill ?? null,
    kill_evidence: brief.kill_evidence ?? null,
    needs_immediate_attention: brief.needs_immediate_attention ?? false,
    immediate_attention_reason: brief.immediate_attention_reason ?? null,
    confidence_in_brief: brief.confidence_in_brief ?? 'medium',
    ai_edge_summary: brief.ai_edge_summary ?? null,
    years_ahead_local: brief.years_ahead_local ?? null,
    years_ahead_regional: brief.years_ahead_regional ?? null,
    years_ahead_national: brief.years_ahead_national ?? null,
    years_ahead_international: brief.years_ahead_international ?? null,
  }).select('id').single();
  if (error) throw new Error(`Failed to write brief: ${error.message}`);
  return data.id;
}

async function main() {
  console.log(`[roger] Starting — ${new Date().toISOString()}`);
  const posts = await scrapeAllPlatforms();
  const analyses = [];
  const BATCH = 5;
  for (let i = 0; i < posts.length; i += BATCH) {
    const results = await Promise.allSettled(posts.slice(i, i + BATCH).map(p => analyzePost(p)));
    for (const r of results) if (r.status === 'fulfilled' && r.value) analyses.push(r.value);
    if (i + BATCH < posts.length) await new Promise(r => setTimeout(r, 500));
  }
  console.log(`[roger] Analyzed ${analyses.length}/${posts.length} posts`);
  let written = 0;
  for (const a of analyses) if (await writeCreatorIntelligence(a.post, a)) written++;
  console.log(`[roger] Wrote ${written} creator_content_intelligence rows`);
  await log(AGENT, 'scrape_and_analyze', 'success', { payload: { posts_scraped: posts.length, rows_written: written }, duration_ms: Date.now() - start });
  const brief = await composeBrief(analyses);
  const newHooks = analyses.filter(a => a.adaptation_confidence === 'high').length;
  const newPatterns = [...new Set(analyses.map(a => a.key_pattern).filter(Boolean))].length;
  const briefId = await writeBrief(brief, newHooks, newPatterns);
  console.log(`[roger] Brief written: ${briefId}`);
  await emitEvent(AGENT, 'roger.brief.ready', { brief_id: briefId, brief_date: new Date().toISOString().split('T')[0], social_agent_priority: brief.social_agent_priority, needs_immediate_attention: brief.needs_immediate_attention }, ['social_sarah','webster','peter_paid_ads','emille_email','oliver'], brief.needs_immediate_attention ? 1 : 5);
  await log(AGENT, 'nightly_run_complete', 'success', { payload: { brief_id: briefId, posts_scraped: posts.length }, duration_ms: Date.now() - start, related_id: briefId, related_type: 'roger_nightly_brief' });
  console.log(`[roger] Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main().catch(err => { console.error('[roger] Fatal:', err); process.exit(1); });
