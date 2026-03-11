truncate table public.node_embeddings;

drop index if exists public.node_embeddings_embedding_idx;

alter table public.node_embeddings
  alter column embedding type extensions.vector(1024)
  using subvector(embedding, 1, 1024)::extensions.vector(1024);

create index if not exists node_embeddings_embedding_idx
  on public.node_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

drop function if exists public.match_node_embeddings(
  extensions.vector(1536),
  integer,
  text,
  text
);

create or replace function public.match_node_embeddings(
  query_embedding extensions.vector(1024),
  match_count integer default 6,
  filter_star_id text default null,
  filter_planet_id text default null
)
returns table (
  node_id uuid,
  chunk_index integer,
  content_chunk text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    e.node_id,
    e.chunk_index,
    e.content_chunk,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.node_embeddings e
  join public.nodes n on n.id = e.node_id
  where (filter_star_id is null or n.star_id = filter_star_id)
    and (filter_planet_id is null or n.planet_id = filter_planet_id)
  order by e.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

revoke all on function public.match_node_embeddings(
  extensions.vector(1024),
  integer,
  text,
  text
) from public;

revoke all on function public.match_node_embeddings(
  extensions.vector(1024),
  integer,
  text,
  text
) from anon, authenticated;

grant execute on function public.match_node_embeddings(
  extensions.vector(1024),
  integer,
  text,
  text
) to service_role;

comment on function public.match_node_embeddings(
  extensions.vector(1024),
  integer,
  text,
  text
) is 'Server-only scoped pgvector search over node_embeddings for assistant retrieval workflows.';
