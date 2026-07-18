begin;

alter table public.obsidian_sources
  add column if not exists frontmatter jsonb not null default '{}'::jsonb,
  add column if not exists sync_error text;

commit;
