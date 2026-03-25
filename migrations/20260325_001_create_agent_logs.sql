-- =============================================================================
-- agent_logs: Central logging table for all 8 agents
-- Every agent action, API call, decision, error, and outcome gets a row here.
-- =============================================================================

create table if not exists agent_logs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  agent_name    text not null,                -- e.g. 'lead_capture', 'nurture', 'content'
  action        text not null,                -- e.g. 'send_sms', 'publish_post', 'score_lead'
  status        text not null default 'success',  -- 'success', 'error', 'warning', 'pending'
  payload       jsonb default '{}'::jsonb,    -- request/response data, parameters, context
  error         text,                         -- error message if status = 'error'
  duration_ms   integer,                      -- how long the action took
  related_id    uuid,                         -- optional FK to the entity this log concerns
  related_type  text                          -- e.g. 'lead', 'content', 'campaign'
);

-- Indexes
create index idx_agent_logs_agent_name on agent_logs (agent_name);
create index idx_agent_logs_status on agent_logs (status);
create index idx_agent_logs_created_at on agent_logs (created_at desc);
create index idx_agent_logs_agent_action on agent_logs (agent_name, action);
create index idx_agent_logs_related on agent_logs (related_type, related_id)
  where related_id is not null;

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_agent_logs_updated_at
  before update on agent_logs
  for each row execute function update_updated_at();

-- Row Level Security
alter table agent_logs enable row level security;

create policy "Service role has full access to agent_logs"
  on agent_logs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
