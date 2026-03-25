-- =============================================================================
-- notification_queue: Alerts, approvals, and escalations routed to Ben
-- Agents create notifications when they need human review or want to surface
-- important events. Ben can approve, reject, or acknowledge.
-- =============================================================================

create table if not exists notification_queue (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Source
  source_agent    text not null,                -- agent that created this notification
  related_id      uuid,                         -- ID of the related entity
  related_type    text,                         -- e.g. 'lead', 'content', 'ad_campaign', 'agent_task'

  -- Notification
  notification_type text not null,              -- 'approval_required', 'alert', 'report', 'error', 'milestone'
  priority        text not null default 'normal', -- 'critical', 'high', 'normal', 'low'
  title           text not null,
  message         text not null,
  data            jsonb default '{}'::jsonb,    -- additional context, preview data

  -- Delivery
  channel         text not null default 'sms',  -- 'sms', 'email', 'both'
  sent_at         timestamptz,                  -- when the notification was delivered
  delivered       boolean default false,

  -- Response
  status          text not null default 'pending', -- 'pending', 'sent', 'seen', 'approved', 'rejected', 'acknowledged', 'expired'
  response        text,                         -- Ben's response text
  responded_at    timestamptz,

  -- Expiry
  expires_at      timestamptz,                  -- auto-expire if no response
  auto_action     text                          -- what to do on expiry: 'approve', 'reject', 'none'
);

-- Indexes
create index idx_notification_queue_status on notification_queue (status);
create index idx_notification_queue_priority on notification_queue (
  case priority
    when 'critical' then 1
    when 'high' then 2
    when 'normal' then 3
    when 'low' then 4
  end
) where status = 'pending';
create index idx_notification_queue_source on notification_queue (source_agent);
create index idx_notification_queue_type on notification_queue (notification_type);
create index idx_notification_queue_pending on notification_queue (created_at desc)
  where status = 'pending';
create index idx_notification_queue_expiry on notification_queue (expires_at)
  where status = 'pending' and expires_at is not null;

create trigger trg_notification_queue_updated_at
  before update on notification_queue
  for each row execute function update_updated_at();

-- Row Level Security
alter table notification_queue enable row level security;

create policy "Service role has full access to notification_queue"
  on notification_queue for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
