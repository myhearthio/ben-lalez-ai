import { log, emitEvent } from '../../lib/supabase.js';
import { runStrategy } from './strategy.js';
import { runWriter } from './writer.js';
import { runVisual } from './visual.js';
import { runPublisher } from './publisher.js';

const AGENT = 'social_sarah';
const start = Date.now();

const args = process.argv.slice(2);
const stageArg = args.find(a => a.startsWith('--stage='))?.split('=')[1];
const queueIdsArg = args.find(a => a.startsWith('--queue-ids='))?.split('=')[1];
const queueIds = queueIdsArg ? queueIdsArg.split(',') : null;

async function runFullPipeline() {
  console.log(`[sarah] Starting full pipeline — ${new Date().toISOString()}`);
  const newQueueIds = await runStrategy();
  console.log(`[sarah] Stage 1 complete: ${newQueueIds.length} items queued`);
  await new Promise(r => setTimeout(r, 2000));
  const written = await runWriter(newQueueIds);
  console.log(`[sarah] Stage 2 complete: ${written} items have copy`);
  await new Promise(r => setTimeout(r, 2000));
  const visualJobs = await runVisual(newQueueIds);
  console.log(`[sarah] Stage 3 complete: ${visualJobs} visual jobs created`);
  await new Promise(r => setTimeout(r, 2000));
  const publishResult = await runPublisher(newQueueIds);
  console.log(`[sarah] Stage 4 complete: ${publishResult.approvalCount} to approval, ${publishResult.scheduledCount} scheduled`);
  await emitEvent(AGENT, 'sarah.pipeline.complete', { items_queued: newQueueIds.length, sent_to_approval: publishResult.approvalCount, scheduled: publishResult.scheduledCount, duration_ms: Date.now() - start }, ['oliver'], 5);
  await log(AGENT, 'pipeline_complete', 'success', { payload: { items_queued: newQueueIds.length, sent_to_approval: publishResult.approvalCount, scheduled: publishResult.scheduledCount }, duration_ms: Date.now() - start });
  console.log(`[sarah] Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

async function runSingleStage(stage) {
  switch (stage) {
    case 'strategy': await runStrategy(); break;
    case 'writer': await runWriter(queueIds); break;
    case 'visual': await runVisual(queueIds); break;
    case 'publisher': await runPublisher(queueIds); break;
    default: throw new Error(`Unknown stage: ${stage}`);
  }
}

if (stageArg) {
  runSingleStage(stageArg).catch(err => { console.error(err); process.exit(1); });
} else {
  runFullPipeline().catch(err => { console.error(err); process.exit(1); });
}
