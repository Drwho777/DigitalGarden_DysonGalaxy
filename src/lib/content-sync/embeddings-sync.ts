import { readEmbeddingConfig } from '../ai/embedding.ts';
import { chunkMarkdownDocument } from './chunk-markdown.ts';

export interface ChangedNodeEmbeddingInput {
  contentHash: string;
  contentRaw: string;
  id: string;
}

export interface NodeEmbeddingsSyncSummary {
  embeddedChunkCount: number;
  embeddedNodeCount: number;
}

interface NodeEmbeddingsSupabaseClientLike {
  rpc(
    fn: 'replace_node_embeddings_for_node',
    args: {
      expected_content_hash: string;
      rows: Array<{
        chunk_index: number;
        chunk_token_count: number;
        content_chunk: string;
        embedding: number[];
        embedding_model: string;
      }>;
      target_node_id: string;
    },
  ): Promise<{ error: unknown | null }>;
}

export function approximateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

export async function syncNodeEmbeddings(input: {
  changedNodes: ChangedNodeEmbeddingInput[];
  embedDocument: (text: string) => Promise<number[]>;
  maxChars?: number;
  supabase: NodeEmbeddingsSupabaseClientLike;
}): Promise<NodeEmbeddingsSyncSummary> {
  const embeddingModel = readEmbeddingConfig().model;
  let embeddedChunkCount = 0;

  for (const node of input.changedNodes) {
    const chunks = chunkMarkdownDocument(node.contentRaw, {
      maxChars: input.maxChars,
    });

    const preparedRows = await Promise.all(
      chunks.map(async (chunk) => {
        const embedding = await input.embedDocument(chunk.content);
        embeddedChunkCount += 1;

        return {
          chunk_index: chunk.chunkIndex,
          chunk_token_count: approximateTokenCount(chunk.content),
          content_chunk: chunk.content,
          embedding,
          embedding_model: embeddingModel,
        };
      }),
    );

    const { error } = await input.supabase.rpc(
      'replace_node_embeddings_for_node',
      {
        expected_content_hash: node.contentHash,
        rows: preparedRows,
        target_node_id: node.id,
      },
    );

    if (error) {
      throw error;
    }
  }

  return {
    embeddedChunkCount,
    embeddedNodeCount: input.changedNodes.length,
  };
}
