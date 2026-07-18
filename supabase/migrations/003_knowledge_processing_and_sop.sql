begin;

alter table public.knowledge_resources
  add column if not exists source_content_hash text,
  add column if not exists analysis_input_tokens integer,
  add column if not exists analysis_output_tokens integer,
  add column if not exists analysis_error text,
  add column if not exists analyzed_at timestamptz;

create table if not exists public.sop_chunks (
  id uuid primary key,
  book text not null,
  chapter integer not null,
  title text not null,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  content_hash text not null,
  source_created_at timestamptz,
  imported_at timestamptz not null default now(),
  unique (book, chapter, chunk_index)
);

create table if not exists public.sop_chunk_embeddings (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null references public.sop_chunks(id) on delete cascade,
  embedding_version integer not null check (embedding_version > 0),
  embedding vector(384) not null,
  embedding_model text not null,
  embedding_revision text not null,
  embedding_dtype text not null,
  preprocessing text not null,
  created_at timestamptz not null default now(),
  unique (chunk_id, embedding_version)
);

create index if not exists sop_chunks_book_chapter_idx
  on public.sop_chunks (book, chapter, chunk_index);
create index if not exists sop_chunk_embeddings_version_idx
  on public.sop_chunk_embeddings (embedding_version, chunk_id);
create index if not exists sop_chunk_embeddings_vector_idx
  on public.sop_chunk_embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.sop_chunks enable row level security;
alter table public.sop_chunk_embeddings enable row level security;

create policy "authenticated_read_sop_chunks"
on public.sop_chunks for select to authenticated
using (true);

create policy "authenticated_read_sop_chunk_embeddings"
on public.sop_chunk_embeddings for select to authenticated
using (true);

grant select on public.sop_chunks to authenticated;
grant select on public.sop_chunk_embeddings to authenticated;
grant all on public.sop_chunks to service_role;
grant all on public.sop_chunk_embeddings to service_role;

create or replace function public.match_sop_chunks(
  query_embedding vector(384),
  match_threshold double precision default 0.3,
  match_count integer default 30,
  requested_embedding_version integer default 1
)
returns table (
  id uuid,
  book text,
  chapter integer,
  title text,
  chunk_index integer,
  content text,
  similarity double precision
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
    1 - (versioned.embedding <=> query_embedding) as similarity
  from public.sop_chunk_embeddings versioned
  join public.sop_chunks chunk on chunk.id = versioned.chunk_id
  where versioned.embedding_version = requested_embedding_version
    and 1 - (versioned.embedding <=> query_embedding) > match_threshold
  order by versioned.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_sop_chunks(
  vector, double precision, integer, integer
) to authenticated, service_role;

commit;
