import type { AgentRequestContextInput } from '../../types/agent-context';
import { embedQuery } from '../ai/embedding';
import { createServerSupabaseClient } from '../supabase/server';

export interface KnowledgeSearchMatch {
  chunkIndex: number;
  contentChunk: string;
  nodeId: string;
  similarity: number;
}

interface MatchNodeEmbeddingRow {
  chunk_index: number;
  content_chunk: string;
  node_id: string;
  similarity: number;
}

export async function searchKnowledge(input: {
  context?: AgentRequestContextInput;
  query: string;
}): Promise<KnowledgeSearchMatch[]> {
  const queryEmbedding = await embedQuery(input.query);
  const client = createServerSupabaseClient();

  const { data, error } = await client.rpc('match_node_embeddings', {
    filter_planet_id: input.context?.routeType === 'hub'
      ? null
      : input.context?.planetId ?? null,
    filter_star_id:
      input.context?.routeType === 'hub' ? null : input.context?.starId ?? null,
    match_count: 6,
    query_embedding: queryEmbedding,
  });

  if (error) {
    throw error;
  }

  return ((data ?? []) as MatchNodeEmbeddingRow[]).map((match) => ({
    chunkIndex: match.chunk_index,
    contentChunk: match.content_chunk,
    nodeId: match.node_id,
    similarity: match.similarity,
  }));
}
