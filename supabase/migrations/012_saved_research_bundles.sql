-- 설교 생성 여부와 관계없이 완성된 연구 묶음을 저장하고 다시 열람한다.

begin;

create table if not exists public.research_bundles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  personal_context text not null default '',
  input_type text not null check (input_type in ('bible_reference', 'relationship', 'social', 'theme')),
  core_message text not null,
  bundle jsonb not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_bundles_user_recent_idx
  on public.research_bundles (user_id, created_at desc);

alter table public.research_bundles enable row level security;
revoke all on public.research_bundles from anon, authenticated;
grant all on public.research_bundles to service_role;

commit;
