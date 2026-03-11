import type { SourceNode } from './markdown-source';

export interface NodesSyncSummary {
  readyToUpsert: number;
  scanned: number;
  upserted: number;
}

export interface NodesUpsertRow {
  content_hash: string;
  content_raw: string;
  hero_image: string;
  planet_id: string;
  published_at: string;
  slug: string;
  star_id: string;
  summary: string;
  tags: string[];
  title: string;
}

interface NodesSupabaseClientLike {
  from(table: 'nodes'): {
    upsert(
      rows: NodesUpsertRow[],
      options: { onConflict: string },
    ): Promise<{ error: unknown | null }>;
  };
}

export function mapSourceNodeToUpsertRow(node: SourceNode): NodesUpsertRow {
  return {
    content_hash: node.contentHash,
    content_raw: node.body,
    hero_image: node.heroImage,
    planet_id: node.planetId,
    published_at: node.publishedAt,
    slug: node.slug,
    star_id: node.starId,
    summary: node.summary,
    tags: node.tags,
    title: node.title,
  };
}

export async function syncNodesToSupabase(input: {
  dryRun?: boolean;
  sourceNodes: SourceNode[];
  supabase: NodesSupabaseClientLike;
}): Promise<NodesSyncSummary> {
  const rows = input.sourceNodes.map(mapSourceNodeToUpsertRow);
  const summary: NodesSyncSummary = {
    readyToUpsert: rows.length,
    scanned: input.sourceNodes.length,
    upserted: 0,
  };

  if (input.dryRun) {
    return summary;
  }

  const { error } = await input.supabase.from('nodes').upsert(rows, {
    onConflict: 'star_id,planet_id,slug',
  });

  if (error) {
    throw error;
  }

  return {
    ...summary,
    upserted: rows.length,
  };
}
