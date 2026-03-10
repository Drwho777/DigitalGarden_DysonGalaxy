-- Manually synchronized schema snapshot for assistant observability and
-- retrieval support.
-- The migrations were applied to the remote database via Supabase CLI on
-- 2026-03-10, but `supabase db dump` could not run in this environment because
-- Docker/pg_dump was unavailable locally.
-- The resulting remote state was then verified via read-only Supabase MCP
-- queries:
--   - public.assistant_events exists
--   - public.nodes.content_hash exists
--   - public.node_embeddings has embedding_model / chunk_token_count / updated_at
--   - public.match_node_embeddings exists
--   - only postgres and service_role have EXECUTE on match_node_embeddings
--   - public.node_embeddings has no public read policies

create table if not exists public.assistant_events (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  route_type text not null,
  star_id text,
  planet_id text,
  slug text,
  interaction_intent text not null,
  action_type text,
  action_target_id text,
  success boolean not null,
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists assistant_events_created_at_idx
  on public.assistant_events (created_at desc);

alter table public.assistant_events enable row level security;

comment on table public.assistant_events is
  'Server-only observability log for assistant requests, scope, intent, and outcomes.';

alter table public.nodes
  add column if not exists content_hash text;

alter table public.node_embeddings
  add column if not exists embedding_model text,
  add column if not exists chunk_token_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.node_embeddings enable row level security;

-- Intentionally no anon/authenticated policy for node_embeddings.
-- Vector data stays private and should be queried server-side with service-role access.

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
