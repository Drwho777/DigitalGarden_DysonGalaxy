import { createClient } from '@supabase/supabase-js';
import { readRuntimeEnv } from '../ai/config';

export class SupabaseServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseServerConfigError';
  }
}

export interface ServerSupabaseConfig {
  serviceRoleKey: string;
  url: string;
}

function normalizeEnvValue(value: string | undefined) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

export function readServerSupabaseConfig(
  env: Record<string, string | undefined> = readRuntimeEnv(),
): ServerSupabaseConfig {
  const url =
    normalizeEnvValue(env.SUPABASE_URL) ??
    normalizeEnvValue(env.PUBLIC_SUPABASE_URL);

  if (!url) {
    throw new SupabaseServerConfigError(
      'SUPABASE_URL is not configured for server-side Supabase access.',
    );
  }

  const serviceRoleKey = normalizeEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRoleKey) {
    throw new SupabaseServerConfigError(
      'SUPABASE_SERVICE_ROLE_KEY is not configured for server-side Supabase access.',
    );
  }

  return {
    serviceRoleKey,
    url,
  };
}

export function createServerSupabaseClient() {
  const config = readServerSupabaseConfig();

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
