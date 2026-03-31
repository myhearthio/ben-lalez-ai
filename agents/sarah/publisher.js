import { supabase, log, emitEvent } from '../../lib/supabase.js';

const AGENT = 'sarah_publisher';
const AUTO_POST_PLATFORMS = ['linkedin', 'facebook'];
const APPROVAL_REQUIRED_TYPES = ['reels', 'tiktok', 'youtube_short', 'carousel'];

function requiresApproval(item) {
  if (APPROVAL_REQUIRED_TYPES.includes(item.content_type)) return true;
  const nonAuto = (item.platforms ?? []).filter(p => !AUTO_POST_PLATFORMS.includes(p));
  return nonAuto.length > 0;
}

async function getReadyItems(queueIds) {
  let query = supabase.from('sarah_content_queue').select('*').eq('copy_complete', true).not('status', 'in', '("published","scheduled","in_approval")').order('priority', { ascending: true }).limit(20);
  if (queueIds && queueIds.length > 0) query = query.in('id', queueIds);
  const { data, error } = await query;
  if (error) throw new Error('Cannot read sarah_content_queue: ' + error.message);
  return (data ?? []).filter(item => item.visual_complete === true || item.visual_type === 'none');
}

async function sendToApproval(item) {
  const { error } = await supabase.from('sarah_approval_queue').insert({ queue_item_id: item.id, content_type: item.content_type, platforms: item.platforms, preview_caption: item.caption ?? null, preview_script: item.script ?? null, preview_hook: item.hook ?? null, visual_url: item.canva_design_url ?? null, audio_url: item.audio_url ?? null, status: 'pending', priority: item.priority <= 2 ? 'high' : 'normal' });
  if (error) throw new Error('Failed to create approval item: ' + error.message);
  await supabase.from('sarah_content_queue').update({ status: 'in_approval', updated_at: new Date().toISOString() }).eq('id', item.id);
}

async function scheduleToCalendar(item) {
  const publishDate = item.target_publish_date ?? new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const rows = (item.platforms ?? ['instagram']).map(platform => ({ publish_date: publishDate, content_type: item.content_type, topic: item.topic, headline: item.hook ?? null, assigned_agent: AGENT, status: 'scheduled', content_body: item.caption ?? null, media_needed: item.visual_type !== 'none', media_type: item.visual_type !== 'none' ? item.visual_type : null, elevenlabs_script: item.script ?? null, canva_template: item.canva_design_url ?? null, notes: 'Queue item: ' + item.id + ' | Platform: ' + platform }));
  const { error } = await supabase.from('content_calendar').insert(rows);
  if (error) throw new Error('Failed to write content_calendar: ' + error.message);
  await supabase.from('sarah_content_queue').update({ status: 'scheduled', scheduled_at: new Date(publishDate + 'T10:00:00').toISOString(), updated_at: new Date().toISOString() }).eq('id', item.id);
}

export async function runPublisher(queueIds = null) {
  const startTime = Date.now();
  console.log('[sarah_publisher] Starting');
  const items = await getReadyItems(queueIds);
  console.log('[sarah_publisher] ' + items.length + ' items ready');
  let approvalCount = 0, scheduledCount = 0;
  for (const item of items) {
    try {
      if (requiresApproval(item)) { await sendToApproval(item); approvalCount++; console.log('[sarah_publisher] To approval: ' + item.topic); }
      else { await scheduleToCalendar(item); scheduledCount++; console.log('[sarah_publisher] Scheduled: ' + item.topic); }
    } catch (err) {
      console.error('[sarah_publisher] Failed for ' + item.id + ':', err.message);
      await log(AGENT, 'publish_failed', 'error', { error: err.message, related_id: item.id, related_type: 'sarah_content_queue' });
    }
  }
  const { data: approved } = await supabase.from('sarah_approval_queue').select('*, sarah_content_queue!queue_item_id(*)').eq('status', 'approved').not('reviewed_at', 'is', null).limit(10);
  for (const approval of (approved ?? [])) {
    try {
      const qi = approval.sarah_content_queue;
      if (qi && qi.status !== 'scheduled') { await scheduleToCalendar(qi); scheduledCount++; }
    } catch (err) { console.error('[sarah_publisher] Failed to schedule approved item:', err.message); }
  }
  await emitEvent(AGENT, 'sarah.publish.complete', { sent_to_approval: approvalCount, scheduled: scheduledCount }, ['oliver'], 5);
  await log(AGENT, 'publisher_run_complete', 'success', { payload: { items_processed: items.length, sent_to_approval: approvalCount, scheduled: scheduledCount }, duration_ms: Date.now() - startTime });
  console.log('[sarah_publisher] Done — ' + approvalCount + ' to approval, ' + scheduledCount + ' scheduled');
  return { approvalCount, scheduledCount };
}

if (process.argv[1].endsWith('publisher.js')) {
  runPublisher().catch(err => { console.error(err); process.exit(1); });
}
