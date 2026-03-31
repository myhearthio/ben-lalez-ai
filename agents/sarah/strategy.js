import { supabase, log, emitEvent } from '../../lib/supabase.js';
import { callClaudeJSON } from '../../lib/claude.js';

const AGENT = 'sarah_strategy';

async function getLatestBrief() {
  const { data, error } = await supabase.from('roger_nightly_brief').select('*').order('brief_date', { ascending: false }).limit(1).single();
  if (error) throw new Error('Cannot read roger_nightly_brief: ' + error.message);
  return data;
}

async function getCreatorIntelligence() {
  const since = new Date(); since.setDate(since.getDate() - 3);
  const { data, error } = await supabase.from('creator_content_intelligence').select('*').gte('researched_at', since.toISOString()).eq('ready_to_produce', true).order('relevance_to_ben', { ascending: false }).limit(20);
  if (error) throw new Error('Cannot read creator_content_intelligence: ' + error.message);
  return data ?? [];
}

async function getRecentQueue() {
  const since = new Date(); since.setDate(since.getDate() - 7);
  const { data } = await supabase.from('sarah_content_queue').select('topic, content_type').gte('created_at', since.toISOString());
  return data ?? [];
}

const STRATEGY_SYSTEM = 'You are Sarah, Content Strategy Director for Ben Lalez Team. Plan this weeks social content from Rogers brief. Rules: Contractor angle in every piece. Data over adjectives. Chicago-specific always. One job per post. No fluff openers. Max 2 emojis. Ben films once per week max. Return ONLY a valid JSON array. Each item: { "content_type": "string", "platforms": ["string"], "format_name": "string", "topic": "string", "roger_signal": "string", "target_audience": "buyers|sellers|both|agents", "emotional_trigger": "string", "filming_required": false, "ben_effort_level": 0, "kill_condition": "string", "target_publish_date": "YYYY-MM-DD", "priority": 5, "hook": "string", "visual_type": "carousel|reels|static|none", "cta": "string" }';

async function generateContentPlan(brief, creators, recentTopics) {
  const recentTopicList = recentTopics.map(t => t.topic).join(', ') || 'none';
  const adaptations = creators.slice(0, 8).map(c => '- @' + c.creator_handle + ' (' + c.creator_platform + '): "' + c.ben_lalez_hook + '" | pattern: ' + c.key_pattern).join('\n');
  const today = new Date();
  const weekDates = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() + i); return d.toISOString().split('T')[0]; });
  const prompt = 'Rogers brief for ' + brief.brief_date + ':\n- Top pattern: ' + brief.top_content_pattern_today + '\n- Hook to use: ' + brief.hook_to_use_immediately + '\n- Social priority: ' + brief.social_agent_priority + '\n- Gap to exploit: ' + brief.gap_to_exploit + '\n\nCreator adaptations:\n' + (adaptations || 'None.') + '\n\nRecent topics (avoid): ' + recentTopicList + '\nAvailable dates: ' + weekDates.join(', ') + '\n\nGenerate 6-10 content items. Max 2 filming-required. Prioritize automated. Return JSON array only.';
  return callClaudeJSON(STRATEGY_SYSTEM, prompt, 'sonnet', 2500);
}

async function writeContentQueue(items) {
  const rows = items.map(item => ({ source_agent: AGENT, content_type: item.content_type, platforms: item.platforms, format_name: item.format_name ?? null, topic: item.topic, roger_signal: item.roger_signal ?? null, target_audience: item.target_audience ?? null, emotional_trigger: item.emotional_trigger ?? null, filming_required: item.filming_required ?? false, ben_effort_level: item.ben_effort_level ?? 0, kill_condition: item.kill_condition ?? null, target_publish_date: item.target_publish_date ?? null, priority: item.priority ?? 5, hook: item.hook ?? null, visual_type: item.visual_type ?? 'none', cta: item.cta ?? null, status: 'queued', copy_complete: false, visual_complete: false }));
  const { data, error } = await supabase.from('sarah_content_queue').insert(rows).select('id');
  if (error) throw new Error('Failed to write content queue: ' + error.message);
  return data.map(r => r.id);
}

export async function runStrategy() {
  const startTime = Date.now();
  console.log('[sarah_strategy] Starting');
  const brief = await getLatestBrief();
  const [creators, recentQueue] = await Promise.all([getCreatorIntelligence(), getRecentQueue()]);
  const plan = await generateContentPlan(brief, creators, recentQueue);
  if (!Array.isArray(plan)) throw new Error('Plan is not an array');
  const queueIds = await writeContentQueue(plan);
  await emitEvent(AGENT, 'sarah.strategy.complete', { items_queued: queueIds.length, brief_date: brief.brief_date }, ['social_sarah'], 5);
  await log(AGENT, 'strategy_run_complete', 'success', { payload: { items_queued: queueIds.length }, duration_ms: Date.now() - startTime });
  console.log('[sarah_strategy] Done — ' + queueIds.length + ' items queued');
  return queueIds;
}

if (process.argv[1].endsWith('strategy.js')) {
  runStrategy().catch(err => { console.error(err); process.exit(1); });
}
