-- =============================================================================
-- agent_tasks: Inter-agent task queue and coordination
-- The Orchestrator assigns work; agents pick up, execute, and report back.
-- =============================================================================

create table if not exists agent_tasks (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Who and what
  assigned_agent  text not null,              -- agent responsible for execution
  created_by      text not null,              -- agent or 'orchestrator' that created the task
  task_type       text not null,              -- e.g. 'send_drip', 'publish_post', 'optimize_ad'
  description     text,                       -- human-readable description of the task

  -- Execution
  status          text not null default 'pending',  -- 'pending', 'in_progress', 'completed', 'failed', 'cancelled'
  priority        integer not null default 5,       -- 1 (highest) to 10 (lowest)
  payload         jsonb default '{}'::jsonb,        -- task parameters and context
  result          jsonb,                            -- output data after execution
  error           text,                             -- error message if failed

  -- Scheduling
  scheduled_at    timestamptz,               -- when this task should execute (null = immediate)
  started_at      timestamptz,               -- when execution began
  completed_at    timestamptz,               -- when execution finished

  -- Dependencies
  depends_on      uuid[],                    -- task IDs that must complete first
  retry_count     integer not null default 0,
  max_retries     integer not null default 3
);

-- Indexes
create index idx_agent_tasks_assigned_agent on agent_tasks (assigned_agent);
create index idx_agent_tasks_status on agent_tasks (status);
create index idx_agent_tasks_priority on agent_tasks (priority asc, created_at asc)
  where status = 'pending';
create index idx_agent_tasks_scheduled on agent_tasks (scheduled_at)
  where status = 'pending' and scheduled_at is not null;
create index idx_agent_tasks_created_by on agent_tasks (created_by);

create trigger trg_agent_tasks_updated_at
  before update on agent_tasks
  for each row execute function update_updated_at();

-- Row Level Security
alter table agent_tasks enable row level security;

create policy "Service role has full access to agent_tasks"
  on agent_tasks for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
