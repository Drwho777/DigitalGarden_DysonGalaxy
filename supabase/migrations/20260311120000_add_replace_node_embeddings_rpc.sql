create or replace function public.replace_node_embeddings_for_node(
  target_node_id uuid,
  expected_content_hash text,
  rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1
    from public.nodes
    where id = target_node_id
      and content_hash = expected_content_hash
  ) then
    raise exception 'content_hash mismatch for node %', target_node_id;
  end if;

  delete from public.node_embeddings
  where node_id = target_node_id;

  insert into public.node_embeddings (
    node_id,
    chunk_index,
    content_chunk,
    embedding,
    embedding_model,
    chunk_token_count
  )
  select
    target_node_id,
    row.chunk_index,
    row.content_chunk,
    row.embedding::text::extensions.vector(1024),
    row.embedding_model,
    row.chunk_token_count
  from jsonb_to_recordset(rows) as row(
    chunk_index integer,
    content_chunk text,
    embedding jsonb,
    embedding_model text,
    chunk_token_count integer
  );
end;
$$;

revoke all on function public.replace_node_embeddings_for_node(uuid, text, jsonb)
from public;

revoke all on function public.replace_node_embeddings_for_node(uuid, text, jsonb)
from anon, authenticated;

grant execute on function public.replace_node_embeddings_for_node(uuid, text, jsonb)
to service_role;

comment on function public.replace_node_embeddings_for_node(uuid, text, jsonb) is
  'Server-only transactional replace for node_embeddings rows after a full chunk embedding pass.';
