import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { embedDocument } from '../src/lib/ai/embedding.ts';
import { syncNodeEmbeddings } from '../src/lib/content-sync/embeddings-sync.ts';
import { loadMarkdownSourceNodes } from '../src/lib/content-sync/markdown-source.ts';
import {
  syncNodesToSupabase,
  type NodesUpsertRow,
} from '../src/lib/content-sync/nodes-sync.ts';

function readCliFlags(argv: string[]) {
  return {
    changedOnly: argv.includes('--changed-only'),
    dryRun: argv.includes('--dry-run'),
    withEmbeddings: argv.includes('--with-embeddings'),
  };
}

function parseEnvFile(contents: string) {
  const env: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

function readScriptEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const fileEnv = existsSync(envPath)
    ? parseEnvFile(readFileSync(envPath, 'utf8'))
    : {};

  return {
    ...fileEnv,
    ...process.env,
  };
}

function hydrateProcessEnvForScript() {
  const env = readScriptEnv();
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && value !== '') {
      process.env[key] = value;
    }
  }
}

function createScriptSupabaseClient() {
  const env = readScriptEnv();
  const url = env.SUPABASE_URL?.trim() || env.PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    throw new Error('SUPABASE_URL is required for garden index sync.');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for garden index sync.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createNodeKey(input: {
  planetId: string;
  slug: string;
  starId: string;
}) {
  return `${input.starId}::${input.planetId}::${input.slug}`;
}

function createNodesSyncClient(
  supabase: ReturnType<typeof createScriptSupabaseClient>,
) {
  return {
    from(table: 'nodes') {
      return {
        async upsert(
          rows: NodesUpsertRow[],
          options: { onConflict: string },
        ) {
          const { error } = await supabase.from(table).upsert(rows, options);
          return { error };
        },
      };
    },
  };
}

function createEmbeddingsSyncClient(
  supabase: ReturnType<typeof createScriptSupabaseClient>,
) {
  return {
    async rpc(
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
    ) {
      const { error } = await supabase.rpc(fn, args);
      return { error };
    },
  };
}

async function loadExistingNodesFromSupabase(
  supabase: ReturnType<typeof createScriptSupabaseClient>,
) {
  const { data, error } = await supabase
    .from('nodes')
    .select('id, star_id, planet_id, slug, content_hash');

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{
    content_hash: string | null;
    id: string;
    planet_id: string;
    slug: string;
    star_id: string;
  }>;
}

async function main() {
  hydrateProcessEnvForScript();
  const flags = readCliFlags(process.argv.slice(2));
  const sourceNodes = await loadMarkdownSourceNodes();
  const needsRemoteRead = flags.changedOnly || flags.withEmbeddings;

  const supabase = flags.dryRun && !needsRemoteRead
    ? null
    : createScriptSupabaseClient();
  const existingNodes = needsRemoteRead && supabase
    ? await loadExistingNodesFromSupabase(supabase)
    : [];
  const existingNodeMap = new Map(
    existingNodes.map((node) => [
      createNodeKey({
        planetId: node.planet_id,
        slug: node.slug,
        starId: node.star_id,
      }),
      node,
    ]),
  );
  const changedSourceNodes = sourceNodes.filter((node) => {
    const existingNode = existingNodeMap.get(
      createNodeKey({
        planetId: node.planetId,
        slug: node.slug,
        starId: node.starId,
      }),
    );

    return existingNode?.content_hash !== node.contentHash;
  });
  const nodesToSync = flags.changedOnly ? changedSourceNodes : sourceNodes;
  const skippedCount = flags.changedOnly
    ? sourceNodes.length - nodesToSync.length
    : 0;

  if (flags.dryRun) {
    const summary = await syncNodesToSupabase({
      dryRun: true,
      sourceNodes: nodesToSync,
      supabase: {
        from() {
          throw new Error('Dry-run mode does not write to Supabase.');
        },
      },
    });

    console.log(
      `${sourceNodes.length} nodes scanned, ${changedSourceNodes.length} changed, ${skippedCount} skipped, ${summary.readyToUpsert} nodes ready to upsert.`,
    );
    return;
  }

  if (!supabase) {
    throw new Error('Supabase client is required outside dry-run mode.');
  }

  const summary = await syncNodesToSupabase({
    sourceNodes: nodesToSync,
    supabase: createNodesSyncClient(supabase),
  });
  let embeddedChunkCount = 0;

  if (flags.withEmbeddings && nodesToSync.length > 0) {
    const refreshedNodes = await loadExistingNodesFromSupabase(supabase);
    const refreshedNodeMap = new Map(
      refreshedNodes.map((node) => [
        createNodeKey({
          planetId: node.planet_id,
          slug: node.slug,
          starId: node.star_id,
        }),
        node,
      ]),
    );
    const embeddingSummary = await syncNodeEmbeddings({
      changedNodes: nodesToSync.map((node) => {
        const refreshedNode = refreshedNodeMap.get(
          createNodeKey({
            planetId: node.planetId,
            slug: node.slug,
            starId: node.starId,
          }),
        );

        if (!refreshedNode?.id) {
          throw new Error(
            `Unable to resolve node id after upsert for ${node.starId}/${node.planetId}/${node.slug}.`,
          );
        }

        return {
          contentHash: node.contentHash,
          contentRaw: node.body,
          id: refreshedNode.id,
        };
      }),
      embedDocument,
      supabase: createEmbeddingsSyncClient(supabase),
    });
    embeddedChunkCount = embeddingSummary.embeddedChunkCount;
  }

  console.log(
    `${sourceNodes.length} nodes scanned, ${changedSourceNodes.length} changed, ${skippedCount} skipped, ${summary.upserted} nodes upserted, ${embeddedChunkCount} embedded chunks.`,
  );
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error('[sync:garden:index failed]', error.message);
    if ('cause' in error && error.cause) {
      console.error('[sync:garden:index cause]', error.cause);
    }
  } else {
    console.error('[sync:garden:index failed]');
    console.error(error);
  }
  process.exitCode = 1;
});
