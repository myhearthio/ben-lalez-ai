-- =============================================================================
-- brand_memory: Persistent brand voice, templates, and learned preferences
-- Agents reference this table to stay on-brand. Ben can approve/reject entries
-- to train the system over time.
-- =============================================================================

create table if not exists brand_memory (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Classification
  category        text not null,                -- 'voice', 'template', 'keyword', 'topic', 'audience', 'rule', 'asset'
  subcategory     text,                         -- e.g. 'email_subject_line', 'social_caption', 'cta'

  -- Content
  name            text not null,                -- human-readable identifier
  content         text not null,                -- the actual brand element (template text, voice rule, etc.)
  examples        jsonb,                        -- example usages: [{"input": "...", "output": "..."}]
  metadata        jsonb default '{}'::jsonb,    -- flexible additional data

  -- Usage context
  applicable_channels text[],                   -- e.g. '{instagram, email, blog}' or null for all
  applicable_agents   text[],                   -- which agents should use this, null for all

  -- Quality control
  status          text not null default 'active', -- 'active', 'draft', 'deprecated', 'rejected'
  approved_by     text,                         -- 'ben' or null if auto-generated
  approved_at     timestamptz,
  source          text not null default 'ai',   -- 'ai' (agent-generated), 'human' (Ben), 'imported'

  -- Performance
  times_used      integer default 0,
  avg_performance numeric(5,2),                 -- average performance score when this element was used
  last_used_at    timestamptz
);

-- Indexes
create index idx_brand_memory_category on brand_memory (category);
create index idx_brand_memory_status on brand_memory (status);
create index idx_brand_memory_active on brand_memory (category, subcategory)
  where status = 'active';
create index idx_brand_memory_performance on brand_memory (avg_performance desc nulls last)
  where status = 'active';

create trigger trg_brand_memory_updated_at
  before update on brand_memory
  for each row execute function update_updated_at();

-- Row Level Security
alter table brand_memory enable row level security;

create policy "Service role has full access to brand_memory"
  on brand_memory for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
