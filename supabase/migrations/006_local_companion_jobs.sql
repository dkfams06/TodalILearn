begin;

create table if not exists public.local_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null,
  vault_id text not null,
  capabilities jsonb not null default '[]'::jsonb,
  companion_version text not null default '0.1.0',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_name, vault_id)
);

create table if not exists public.local_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.local_devices(id) on delete cascade,
  job_type text not null check (job_type in ('research')),
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  result jsonb,
  error_code text,
  error_message text,
  attempt_count integer not null default 0,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists local_jobs_device_queue_idx
  on public.local_jobs (device_id, status, created_at);

alter table public.local_devices enable row level security;
alter table public.local_jobs enable row level security;

revoke all on public.local_devices from anon, authenticated;
revoke all on public.local_jobs from anon, authenticated;
grant all on public.local_devices to service_role;
grant all on public.local_jobs to service_role;

create or replace function public.claim_local_job(
  requested_user_id uuid,
  requested_device_id uuid
)
returns setof public.local_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select job.id
    from public.local_jobs job
    where job.user_id = requested_user_id
      and job.device_id = requested_device_id
      and job.status = 'queued'
    order by job.created_at, job.id
    for update skip locked
    limit 1
  )
  update public.local_jobs job
  set status = 'running',
      claimed_at = now(),
      heartbeat_at = now(),
      attempt_count = job.attempt_count + 1,
      updated_at = now()
  from candidate
  where job.id = candidate.id
  returning job.*;
end;
$$;

revoke all on function public.claim_local_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_local_job(uuid, uuid) to service_role;

commit;
