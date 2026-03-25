-- =============================================================================
-- shared_intelligence: Cross-agent knowledge sharing
-- Agents publish insights here so other agents can act on them.
-- e.g. Analytics Agent discovers "Lincoln Park condos trending" -> Content Agent
-- picks it up and writes a blog post -> Ads Agent targets that area.
-- =============================================================================

create table if not exists shared_intelligence (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Origin
  source_agent    text not null,                -- agent that published this insight
  intelligence_type text not null,              -- 'market_trend', 'lead_pattern', 'content_insight', 'ad_performance', 'competitor', 'neighborhood', 'seasonal'

  -- Content
  title           text not null,                -- short summary
  insight         text not null,                -- detailed finding
  data            jsonb default '{}'::jsonb,    -- supporting data, charts, numbers
  confidence      numeric(3,2) not null default 0.5, -- 0.00-1.00 confidence score

  -- Targeting
  target_agents   text[],                       -- which agents should consume this, null = all
  neighborhoods   text[],                       -- Chicago neighborhoods this applies to
  tags            text[],                       -- flexible tagging for discovery

  -- Lifecycle
  status          text not null default 'active', -- 'active', 'consumed', 'expired', 'superseded'
  expires_at      timestamptz,                  -- when this insight becomes stale
  superseded_by   uuid references shared_intelligence(id),

  -- Consumption tracking
  consumed_by     jsonb default '[]'::jsonb,    -- [{"agent": "content", "at": "...", "action_taken": "..."}]
  action_count    integer default 0             -- how many agents acted on this
);

-- Indexes
create index idx_shared_intelligence_type on shared_intelligence (intelligence_type);
create index idx_shared_intelligence_source on shared_intelligence (source_agent);
create index idx_shared_intelligence_active on shared_intelligence (intelligence_type, created_at desc)
  where status = 'active';
create index idx_shared_intelligence_expiry on shared_intelligence (expires_at)
  where status = 'active' and expires_at is not null;
create index idx_shared_intelligence_confidence on shared_intelligence (confidence desc)
  where status = 'active';
create index idx_shared_intelligence_tags on shared_intelligence using gin (tags)
  where status = 'active';

create trigger trg_shared_intelligence_updated_at
  before update on shared_intelligence
  for each row execute function update_updated_at();

-- Row Level Security
alter table shared_intelligence enable row level security;

create policy "Service role has full access to shared_intelligence"
  on shared_intelligence for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
