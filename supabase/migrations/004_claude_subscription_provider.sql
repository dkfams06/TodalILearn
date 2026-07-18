begin;

alter table public.knowledge_resources
  add column if not exists analysis_provider text;

update public.knowledge_resources
set analysis_provider = 'anthropic-api'
where analysis_status = 'completed'
  and analysis_provider is null;

commit;
