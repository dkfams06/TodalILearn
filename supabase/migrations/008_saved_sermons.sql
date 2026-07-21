-- Sprint 6.5: 생성한 설교를 다시 볼 수 있도록 영구 저장한다.
-- 다른 테이블과 분리된 비파괴 추가이며 기존 데이터에 영향이 없다.

begin;

create table if not exists public.sermons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  query text not null,
  core_message text not null,
  estimated_minutes integer not null,
  total_chars integer not null,
  draft jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sermons_user_recent_idx
  on public.sermons (user_id, created_at desc);

alter table public.sermons enable row level security;

revoke all on public.sermons from anon, authenticated;
grant all on public.sermons to service_role;

commit;
