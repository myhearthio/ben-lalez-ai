-- =============================================================================
-- content_performance: Tracks all content across every channel
-- Blog posts, social posts, videos, emails, ads — everything the Content,
-- Video, and Ads agents produce, with engagement metrics.
-- =============================================================================

create table if not exists content_performance (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Content identity
  content_type      text not null,                -- 'blog_post', 'social_post', 'video', 'email_campaign', 'ad', 'gmb_post'
  channel           text not null,                -- 'wordpress', 'instagram', 'facebook', 'youtube', 'tiktok', 'email', 'google_ads', 'meta_ads', 'gmb'
  title             text,
  body_preview      text,                         -- first 500 chars or summary
  media_urls        text[],                       -- images, video URLs

  -- External references
  external_id       text,                         -- post ID in the external platform
  external_url      text,                         -- public URL of the content
  campaign_id       text,                         -- ad campaign ID if applicable

  -- Publishing
  status            text not null default 'draft', -- 'draft', 'scheduled', 'published', 'paused', 'archived'
  published_at      timestamptz,
  scheduled_at      timestamptz,
  created_by_agent  text not null,                -- which agent created this content

  -- Engagement metrics (updated by Analytics Agent)
  impressions       bigint default 0,
  reach             bigint default 0,
  clicks            bigint default 0,
  likes             integer default 0,
  comments          integer default 0,
  shares            integer default 0,
  saves             integer default 0,
  video_views       bigint default 0,
  watch_time_sec    bigint default 0,

  -- Email-specific metrics
  email_sends       integer default 0,
  email_opens       integer default 0,
  email_clicks      integer default 0,
  email_unsubscribes integer default 0,

  -- Ad-specific metrics
  ad_spend          numeric(10,2) default 0,
  ad_conversions    integer default 0,
  cost_per_click    numeric(8,4),
  cost_per_lead     numeric(10,2),

  -- Attribution
  leads_generated   integer default 0,
  leads_attributed  uuid[],                       -- lead_intelligence IDs attributed to this content

  -- AI analysis
  performance_score integer,                      -- 0-100 AI-assigned performance rating
  ai_insights       text,                         -- AI-generated performance analysis
  topics            text[],                        -- e.g. '{market_update, lincoln_park, pricing}'
  metrics_updated_at timestamptz                  -- last time metrics were refreshed
);

-- Indexes
create index idx_content_performance_type on content_performance (content_type);
create index idx_content_performance_channel on content_performance (channel);
create index idx_content_performance_status on content_performance (status);
create index idx_content_performance_published on content_performance (published_at desc)
  where status = 'published';
create index idx_content_performance_agent on content_performance (created_by_agent);
create index idx_content_performance_score on content_performance (performance_score desc nulls last)
  where status = 'published';
create index idx_content_performance_campaign on content_performance (campaign_id)
  where campaign_id is not null;

create trigger trg_content_performance_updated_at
  before update on content_performance
  for each row execute function update_updated_at();

-- Row Level Security
alter table content_performance enable row level security;

create policy "Service role has full access to content_performance"
  on content_performance for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
