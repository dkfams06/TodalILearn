begin;

create or replace function public.match_knowledge_chunks(
  query_embedding vector(384),
  requested_user_id uuid,
  match_threshold double precision default 0.3,
  match_count integer default 40,
  requested_embedding_version integer default 1
)
returns table (
  chunk_id uuid,
  source_id uuid,
  resource_id uuid,
  title text,
  relative_path text,
  section_name text,
  content text,
  content_start_offset integer,
  content_end_offset integer,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    chunk.id,
    chunk.source_id,
    chunk.resource_id,
    source.title,
    source.relative_path,
    chunk.section_name,
    chunk.content,
    chunk.content_start_offset,
    chunk.content_end_offset,
    1 - (chunk.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks chunk
  join public.obsidian_sources source on source.id = chunk.source_id
  where source.user_id = requested_user_id
    and source.source_deleted = false
    and chunk.embedding_version = requested_embedding_version
    and chunk.embedding is not null
    and 1 - (chunk.embedding <=> query_embedding) > match_threshold
  order by chunk.embedding <=> query_embedding, chunk.id
  limit greatest(1, least(match_count, 100));
$$;

create or replace function public.search_sop_chunks_text(
  query_terms text[],
  match_count integer default 40
)
returns table (
  id uuid,
  book text,
  chapter integer,
  title text,
  chunk_index integer,
  content text,
  lexical_matches integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    chunk.id,
    chunk.book,
    chunk.chapter,
    chunk.title,
    chunk.chunk_index,
    chunk.content,
    cardinality(array(
      select distinct term
      from unnest(query_terms) term
      where length(term) >= 2
        and lower(concat_ws(' ', chunk.book, chunk.title, chunk.content)) like '%' || lower(term) || '%'
    ))::integer as lexical_matches
  from public.sop_chunks chunk
  where exists (
    select 1
    from unnest(query_terms) term
    where length(term) >= 2
      and lower(concat_ws(' ', chunk.book, chunk.title, chunk.content)) like '%' || lower(term) || '%'
  )
  order by lexical_matches desc, chunk.book, chunk.chapter, chunk.chunk_index, chunk.id
  limit greatest(1, least(match_count, 100));
$$;

grant execute on function public.match_knowledge_chunks(
  vector, uuid, double precision, integer, integer
) to authenticated, service_role;

grant execute on function public.search_sop_chunks_text(
  text[], integer
) to authenticated, service_role;

commit;
