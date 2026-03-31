import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) throw new Error('Missing SUPABASE_URL');
if (!process.env.SUPABASE_SERVICE_KEY) throw new Error('Missing SUPABASE_SERVICE_KEY');

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function log(agentName, action, status = 'success', opts = {}) {
  const { error: dbError } = await supabase.from('agent_logs').insert({
    agent_name: agentName,
    action,
    status,
    payload: opts.payload ?? {},
    error: opts.error ?? null,
    duration_ms: opts.duration_ms ?? null,
    related_id: opts.related_id ?? null,
    related_type: opts.related_type ?? null,
  });
  if (dbError) console.error(`[log] Failed:`, dbError.message);
}

export async function emitEvent(sourceAgent, eventType, payload, targetAgents = [], priority = 5) {
  const dedupKey = `${sourceAgent}:${eventType}:${Date.now()}`;
  const { error } = await supabase.from('hive_events').insert({
    event_type: eventType,
    source_agent: sourceAgent,
    target_agents: targetAgents,
    payload,
    priority,
    dedup_key: dedupKey,
  });
  if (error) console.error(`[emitEvent] Failed:`, error.message);
}
