-- =============================================================================
-- lead_intelligence: Enriched lead data, scoring, and engagement tracking
-- Mirrors Follow Up Boss as source of truth but adds AI-driven intelligence.
-- =============================================================================

create table if not exists lead_intelligence (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Follow Up Boss link
  fub_lead_id       bigint unique not null,       -- Follow Up Boss lead ID
  fub_sync_at       timestamptz,                  -- last sync from FUB

  -- Contact basics (cached from FUB for fast agent access)
  first_name        text,
  last_name         text,
  email             text,
  phone             text,
  source            text,                          -- e.g. 'zillow', 'google_ads', 'referral', 'open_house'

  -- AI scoring
  lead_score        integer default 0,             -- 0-100 composite score
  intent_level      text default 'unknown',        -- 'hot', 'warm', 'cold', 'unknown'
  predicted_timeline text,                         -- e.g. '0-30 days', '30-90 days', '90+ days'
  buyer_seller      text,                          -- 'buyer', 'seller', 'both', 'unknown'

  -- Engagement tracking
  total_touches     integer default 0,             -- total emails + SMS + calls
  last_touch_at     timestamptz,
  last_touch_type   text,                          -- 'email', 'sms', 'call', 'ad_click'
  email_opens       integer default 0,
  email_clicks      integer default 0,
  sms_replies       integer default 0,

  -- Search criteria (for buyers)
  target_neighborhoods jsonb,                      -- ["Lincoln Park", "Lakeview"]
  price_min         numeric(12,2),
  price_max         numeric(12,2),
  bedrooms_min      integer,
  property_types    text[],                        -- e.g. '{condo, single_family}'

  -- Seller intelligence
  property_address  text,
  estimated_value   numeric(12,2),
  equity_estimate   numeric(12,2),

  -- Lifecycle
  stage             text default 'new',            -- 'new', 'nurturing', 'active', 'under_contract', 'closed', 'lost'
  assigned_to       text,                          -- team member name
  lost_reason       text,
  closed_at         timestamptz,
  closing_value     numeric(12,2),

  -- AI notes
  enrichment_data   jsonb default '{}'::jsonb,     -- all enrichment data from various sources
  ai_notes          text                           -- AI-generated summary of lead intelligence
);

-- Indexes
create index idx_lead_intelligence_fub_id on lead_intelligence (fub_lead_id);
create index idx_lead_intelligence_score on lead_intelligence (lead_score desc);
create index idx_lead_intelligence_intent on lead_intelligence (intent_level);
create index idx_lead_intelligence_stage on lead_intelligence (stage);
create index idx_lead_intelligence_source on lead_intelligence (source);
create index idx_lead_intelligence_last_touch on lead_intelligence (last_touch_at desc nulls last);
create index idx_lead_intelligence_hot_leads on lead_intelligence (lead_score desc, last_touch_at desc)
  where intent_level = 'hot' and stage in ('new', 'nurturing', 'active');

create trigger trg_lead_intelligence_updated_at
  before update on lead_intelligence
  for each row execute function update_updated_at();

-- Row Level Security
alter table lead_intelligence enable row level security;

create policy "Service role has full access to lead_intelligence"
  on lead_intelligence for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
