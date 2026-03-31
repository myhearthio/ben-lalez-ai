import { supabase, log } from '../../lib/supabase.js';
import { callClaudeJSON } from '../../lib/claude.js';

const AGENT = 'sarah_visual';

async function getItemsNeedingVisuals(queueIds) {
  let query = supabase.from('sarah_content_queue').select('*').eq('copy_complete', true).eq('visual_complete', false).neq('visual_type', 'none').order('priority', { ascending: true }).limit(20);
  if (queueIds && queueIds.length > 0) query = query.in('id', queueIds);
  const { data, error } = await query;
  if (error) throw new Error('Cannot read sarah_content_queue: ' + error.message);
  return data ?? [];
}

const CAROUSEL_SYSTEM = 'You are Sarahs visual director. Create Canva carousel briefs for Ben Lalez Team. Style: clean, Chicago-focused, data-heavy, navy/white/gold palette. Return ONLY valid JSON: { "slide_count": number, "slides": [{ "slide_number": number, "headline": "string", "body": "string", "visual_direction": "string", "data_to_show": "string or null" }], "color_palette": "string", "font_mood": "bold|clean|editorial", "cta_slide": "string" }';

const VIDEO_SYSTEM = 'You are Sarahs visual director. Create video production briefs. Return ONLY valid JSON: { "video_type": "heygen_avatar|elevenlabs_voiceover|ben_filming_required", "script_for_voice": "string", "background_direction": "string", "on_screen_text_sequence": ["string"], "estimated_duration_seconds": number, "music_mood": "upbeat|calm|dramatic|none" }';

async function generateCarouselBrief(item) {
  const prompt = 'Create Canva carousel brief for:\nTopic: ' + item.topic + '\nCaption: ' + (item.caption || 'N/A') + '\nScript: ' + (item.script || 'N/A') + '\nOn-screen text: ' + (item.on_screen_text || 'N/A') + '\nPlatform: ' + (item.platforms || []).join(', ') + '\nReturn JSON.';
  return callClaudeJSON(CAROUSEL_SYSTEM, prompt, 'haiku', 1000);
}

async function generateVideoBrief(item) {
  const prompt = 'Create video production brief for:\nTopic: ' + item.topic + '\nScript: ' + (item.script || item.caption || 'N/A') + '\nFilming required: ' + (item.filming_required ? 'YES' : 'NO — use avatar or voiceover') + '\nPlatform: ' + (item.platforms || []).join(', ') + '\nReturn JSON.';
  return callClaudeJSON(VIDEO_SYSTEM, prompt, 'haiku', 800);
}

async function createVisualJob(item, brief, visualType) {
  const { data, error } = await supabase.from('sarah_visual_jobs').insert({ queue_item_id: item.id, visual_type: visualType, brief: JSON.stringify(brief), slide_content: visualType === 'carousel' ? (brief.slides ?? null) : null, script: brief.script_for_voice ?? item.script ?? null, status: 'pending' }).select('id').single();
  if (error) throw new Error('Failed to create visual job: ' + error.message);
  return data.id;
}

async function markVisualDone(itemId) {
  const { error } = await supabase.from('sarah_content_queue').update({ visual_complete: true, status: 'visual_queued', updated_at: new Date().toISOString() }).eq('id', itemId);
  if (error) throw new Error('Failed to update queue item ' + itemId + ': ' + error.message);
}

export async function runVisual(queueIds = null) {
  const startTime = Date.now();
  console.log('[sarah_visual] Starting');
  const items = await getItemsNeedingVisuals(queueIds);
  console.log('[sarah_visual] ' + items.length + ' items need visual jobs');
  let successCount = 0;
  for (const item of items) {
    try {
      const vt = item.visual_type;
      let brief;
      if (vt === 'carousel') brief = await generateCarouselBrief(item);
      else if (['reels','tiktok'].includes(vt) || item.content_type === 'youtube_short') brief = await generateVideoBrief(item);
      else brief = { visual_type: 'static', headline: item.hook ?? item.topic, body: (item.caption ?? '').slice(0, 200), visual_direction: 'Clean branded graphic for ' + item.topic };
      const jobId = await createVisualJob(item, brief, vt);
      await markVisualDone(item.id);
      successCount++;
      console.log('[sarah_visual] Job created: ' + item.topic + ' (id: ' + jobId + ')');
    } catch (err) {
      console.error('[sarah_visual] Failed for ' + item.id + ':', err.message);
      await log(AGENT, 'create_visual_job_failed', 'error', { error: err.message, related_id: item.id, related_type: 'sarah_content_queue' });
    }
  }
  await log(AGENT, 'visual_run_complete', 'success', { payload: { items_processed: items.length, jobs_created: successCount }, duration_ms: Date.now() - startTime });
  console.log('[sarah_visual] Done — ' + successCount + '/' + items.length + ' jobs created');
  return successCount;
}

if (process.argv[1].endsWith('visual.js')) {
  runVisual().catch(err => { console.error(err); process.exit(1); });
}
