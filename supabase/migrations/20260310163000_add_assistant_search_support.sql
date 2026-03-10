alter table public.nodes
  add column if not exists content_hash text;

alter table public.node_embeddings
  add column if not exists embedding_model text,
  add column if not exists chunk_token_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

drop trigger if exists set_node_embeddings_updated_at on public.node_embeddings;
create trigger set_node_embeddings_updated_at
before update on public.node_embeddings
for each row
execute function public.set_updated_at();

create or replace function public.match_node_embeddings(
  query_embedding extensions.vector(1536),
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
  extensions.vector(1536),
  integer,
  text,
  text
) from public;

revoke all on function public.match_node_embeddings(
  extensions.vector(1536),
  integer,
  text,
  text
) from anon, authenticated;

grant execute on function public.match_node_embeddings(
  extensions.vector(1536),
  integer,
  text,
  text
) to service_role;

comment on function public.match_node_embeddings(
  extensions.vector(1536),
  integer,
  text,
  text
) is 'Server-only scoped pgvector search over node_embeddings for assistant retrieval workflows.';
