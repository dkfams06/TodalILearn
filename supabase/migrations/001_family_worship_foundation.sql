begin;

create extension if not exists vector;

create or replace function public.set_family_worship_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.obsidian_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null,
  vault_id text not null,
  local_input_folder text,
  local_output_folder text,
  last_connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_name, vault_id)
);

create table if not exists public.obsidian_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vault_id text not null,
  relative_path text not null,
  file_name text not null,
  folder_path text,
  title text,
  url text,
  channel text,
  published_at date,
  raw_markdown text not null,
  content_hash text not null,
  file_modified_at timestamptz,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'processing', 'completed', 'failed', 'needs_reprocessing', 'source_deleted')),
  source_deleted boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vault_id, relative_path)
);

create table if not exists public.knowledge_resources (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references public.obsidian_sources(id) on delete cascade,
  content_type text,
  allowed_uses jsonb not null default '[]'::jsonb,
  main_topic text,
  sub_topics jsonb not null default '[]'::jsonb,
  main_bible_texts jsonb not null default '[]'::jsonb,
  supporting_bible_texts jsonb not null default '[]'::jsonb,
  biblical_people jsonb not null default '[]'::jsonb,
  biblical_events jsonb not null default '[]'::jsonb,
  core_message text,
  summary text,
  key_claims jsonb not null default '[]'::jsonb,
  illustrations jsonb not null default '[]'::jsonb,
  applications jsonb not null default '[]'::jsonb,
  schema_version integer not null default 1,
  analysis_model text,
  analysis_prompt_version text,
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'processing', 'completed', 'failed', 'needs_reprocessing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.obsidian_sources(id) on delete cascade,
  resource_id uuid references public.knowledge_resources(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  section_name text not null,
  content text not null,
  content_start_offset integer check (content_start_offset is null or content_start_offset >= 0),
  content_end_offset integer check (content_end_offset is null or content_end_offset >= 0),
  token_count integer check (token_count is null or token_count >= 0),
  embedding vector(384),
  embedding_model text,
  embedding_revision text,
  embedding_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, chunk_index, embedding_version),
  check (
    content_start_offset is null
    or content_end_offset is null
    or content_end_offset >= content_start_offset
  )
);

create table if not exists public.family_worship_sermons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  input_type text not null check (input_type in ('topic', 'bible_reference', 'question', 'topic_with_context')),
  input_value text not null,
  personal_context text,
  main_bible_text text,
  core_message text,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes between 1 and 30),
  sermon_markdown text not null,
  discussion_questions jsonb not null default '[]'::jsonb,
  prayer text,
  used_bible_references jsonb not null default '[]'::jsonb,
  used_resource_ids jsonb not null default '[]'::jsonb,
  used_sop_ids jsonb not null default '[]'::jsonb,
  source_map jsonb not null default '[]'::jsonb,
  generation_model text,
  generation_prompt_version text,
  obsidian_relative_path text,
  content_hash text,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced', 'conflict', 'failed')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sermon_versions (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.family_worship_sermons(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  source text not null check (source in ('ai_generation', 'web', 'obsidian', 'conflict_backup')),
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (sermon_id, version_number)
);

create index if not exists obsidian_sources_user_vault_idx
  on public.obsidian_sources (user_id, vault_id);
create index if not exists obsidian_sources_sync_status_idx
  on public.obsidian_sources (user_id, sync_status);
create index if not exists knowledge_resources_main_topic_idx
  on public.knowledge_resources (main_topic);
create index if not exists knowledge_chunks_source_idx
  on public.knowledge_chunks (source_id, chunk_index);
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
create index if not exists family_worship_sermons_user_created_idx
  on public.family_worship_sermons (user_id, created_at desc);
create index if not exists sermon_versions_sermon_version_idx
  on public.sermon_versions (sermon_id, version_number desc);

drop trigger if exists set_obsidian_devices_updated_at on public.obsidian_devices;
create trigger set_obsidian_devices_updated_at
before update on public.obsidian_devices
for each row execute function public.set_family_worship_updated_at();

drop trigger if exists set_obsidian_sources_updated_at on public.obsidian_sources;
create trigger set_obsidian_sources_updated_at
before update on public.obsidian_sources
for each row execute function public.set_family_worship_updated_at();

drop trigger if exists set_knowledge_resources_updated_at on public.knowledge_resources;
create trigger set_knowledge_resources_updated_at
before update on public.knowledge_resources
for each row execute function public.set_family_worship_updated_at();

drop trigger if exists set_knowledge_chunks_updated_at on public.knowledge_chunks;
create trigger set_knowledge_chunks_updated_at
before update on public.knowledge_chunks
for each row execute function public.set_family_worship_updated_at();

drop trigger if exists set_family_worship_sermons_updated_at on public.family_worship_sermons;
create trigger set_family_worship_sermons_updated_at
before update on public.family_worship_sermons
for each row execute function public.set_family_worship_updated_at();

alter table public.obsidian_devices enable row level security;
alter table public.obsidian_sources enable row level security;
alter table public.knowledge_resources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.family_worship_sermons enable row level security;
alter table public.sermon_versions enable row level security;

create policy "users_manage_own_obsidian_devices"
on public.obsidian_devices for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users_manage_own_obsidian_sources"
on public.obsidian_sources for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users_manage_own_knowledge_resources"
on public.knowledge_resources for all to authenticated
using (exists (
  select 1 from public.obsidian_sources source
  where source.id = source_id and source.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.obsidian_sources source
  where source.id = source_id and source.user_id = (select auth.uid())
));

create policy "users_manage_own_knowledge_chunks"
on public.knowledge_chunks for all to authenticated
using (exists (
  select 1 from public.obsidian_sources source
  where source.id = source_id and source.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.obsidian_sources source
  where source.id = source_id and source.user_id = (select auth.uid())
));

create policy "users_manage_own_family_worship_sermons"
on public.family_worship_sermons for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users_manage_own_sermon_versions"
on public.sermon_versions for all to authenticated
using (exists (
  select 1 from public.family_worship_sermons sermon
  where sermon.id = sermon_id and sermon.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.family_worship_sermons sermon
  where sermon.id = sermon_id and sermon.user_id = (select auth.uid())
));

grant select, insert, update, delete on public.obsidian_devices to authenticated;
grant select, insert, update, delete on public.obsidian_sources to authenticated;
grant select, insert, update, delete on public.knowledge_resources to authenticated;
grant select, insert, update, delete on public.knowledge_chunks to authenticated;
grant select, insert, update, delete on public.family_worship_sermons to authenticated;
grant select, insert, update, delete on public.sermon_versions to authenticated;

commit;

