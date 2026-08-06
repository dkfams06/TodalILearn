-- Sprint 11: 옵시디언·예언의 신 자료 전체와 자유롭게 대화하는 채팅 기능을 위한 테이블과
-- local_jobs job_type 확장. 기존 작업과 데이터에 영향이 없는 비파괴 변경이다.

begin;

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_recent_idx
  on public.chat_conversations (user_id, updated_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

revoke all on public.chat_conversations from anon, authenticated;
revoke all on public.chat_messages from anon, authenticated;
grant all on public.chat_conversations to service_role;
grant all on public.chat_messages to service_role;

alter table public.local_jobs
  drop constraint if exists local_jobs_job_type_check;

alter table public.local_jobs
  add constraint local_jobs_job_type_check
  check (job_type in ('research', 'sermon', 'sermon_export', 'sermon_sync', 'chat'));

commit;
