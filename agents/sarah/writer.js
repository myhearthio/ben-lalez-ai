import { supabase, log } from '../../lib/supabase.js';
import { callClaudeJSON } from '../../lib/claude.js';

const AGENT = 'sarah_writer';

async function getQueuedItems(queueIds) {
  let query = supabase.from('sarah_content_queue').select('*').eq('copy_complete', false).eq('status', 'queued').order('priority', { ascending: true }).limit(20);
  if (queueIds && queueIds.length > 0) query = query.in('id', queueIds);
  const { data, error } = await query;
  if (error) throw new Error('Cannot read sarah_content_queue: ' + error.message);
  return data ?? [];
}

async function getLatestBrief() {
  const { data } = await supabase.from('roger_nightly_brief').select('hook_to_use_immediately, top_content_pattern_today, social_agent_priority').order('brief_date', { ascending: false }).limit(1).single();
  return data;
}

const WRITER_SYSTEM = 'You are Sarah, copywriter for Ben Lalez Team. Write in Bens voice: confident, direct, Chicago-specific, data-first, former contractor background surfaces naturally. NEVER: In todays market, hot market, amazing opportunity. MAX 2 emojis. Return ONLY valid JSON: { "hook": "string", "caption": "string", "script": "string or null", "on_screen_text": "string or null", "hashtags": ["string"], "cta": "string" }';

async function generateCopy(item, brief) {
  const isVideo = ['reels','tiktok','youtube_short'].includes(item.content_type);
  const isCarousel = item.content_type === 'carousel';
  const prompt = 'Write copy for:\nContent type: ' + item.content_type + '\nPlatforms: ' + (item.platforms || []).join(', ') + '\nTopic: ' + item.topic + '\nHook from strategy: ' + (item.hook || 'write your own') + '\nAudience: ' + (item.target_audience || 'buyers and sellers') + '\nEmotional trigger: ' + (item.emotional_trigger || 'curiosity') + '\nRoger signal: ' + (item.roger_signal || 'general') + (brief ? '\nRoger hook of day: ' + brief.hook_to_use_immediately : '') + '\n\n' + (isVideo ? 'VIDEO: Write full script in Hook/Body/CTA beats, under 60 seconds (~150 words). on_screen_text = key phrases separated by |.' : isCarousel ? 'CAROUSEL: Caption teases all slides. Script = slide text separated by ---. on_screen_text = slide headers separated by |.' : 'STATIC POST: No script needed.') + '\n\nReturn JSON only.';
  return callClaudeJSON(WRITER_SYSTEM, prompt, 'sonnet', 1500);
}

async function updateItemWithCopy(id, copy) {
  const { error } = await supabase.from('sarah_content_queue').update({ hook: copy.hook ?? null, caption: copy.caption ?? null, script: copy.script ?? null, on_screen_text: copy.on_screen_text ?? null, hashtags: copy.hashtags ?? null, cta: copy.cta ?? null, copy_complete: true, status: 'copy_done', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('Failed to update queue item ' + id + ': ' + error.message);
}

export async function runWriter(queueIds = null) {
  const startTime = Date.now();
  console.log('[sarah_writer] Starting');
  const [items, brief] = await Promise.all([getQueuedItems(queueIds), getLatestBrief()]);
  console.log('[sarah_writer] ' + items.length + ' items need copy');
  let successCount = 0;
  for (const item of items) {
    try {
      const copy = await generateCopy(item, brief);
      await updateItemWithCopy(item.id, copy);
      successCount++;
      console.log('[sarah_writer] Copy complete: ' + item.topic);
    } catch (err) {
      console.error('[sarah_writer] Failed for ' + item.id + ':', err.message);
      await log(AGENT, 'write_copy_failed', 'error', { error: err.message, related_id: item.id, related_type: 'sarah_content_queue' });
    }
  }
  await log(AGENT, 'writer_run_complete', 'success', { payload: { items_processed: items.length, items_succeeded: successCount }, duration_ms: Date.now() - startTime });
  console.log('[sarah_writer] Done — ' + successCount + '/' + items.length + ' written');
  return successCount;
}

if (process.argv[1].endsWith('writer.js')) {
  runWriter().catch(err => { console.error(err); process.exit(1); });
}
