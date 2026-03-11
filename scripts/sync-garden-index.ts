import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadMarkdownSourceNodes } from '../src/lib/content-sync/markdown-source.ts';
import { syncNodesToSupabase } from '../src/lib/content-sync/nodes-sync.ts';

function readCliFlags(argv: string[]) {
  return {
    dryRun: argv.includes('--dry-run'),
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

async function main() {
  const flags = readCliFlags(process.argv.slice(2));
  const sourceNodes = await loadMarkdownSourceNodes();

  if (flags.dryRun) {
    console.log(`${sourceNodes.length} nodes scanned, ${sourceNodes.length} nodes ready to upsert.`);
    return;
  }

  const supabase = createScriptSupabaseClient();
  const summary = await syncNodesToSupabase({
    sourceNodes,
    supabase,
  });

  console.log(`${sourceNodes.length} nodes scanned, ${summary.upserted} nodes upserted.`);
}

main().catch((error) => {
  console.error(
    '[sync:garden:index failed]',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
