import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function parseEnvFile(contents) {
  const env = {};

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

function readLocalEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  return parseEnvFile(readFileSync(envPath, 'utf8'));
}

function readRuntimeValue(key, fallbackEnv = {}) {
  const processValue = process.env[key]?.trim();
  if (processValue) {
    return processValue;
  }

  const fallbackValue = fallbackEnv[key]?.trim();
  return fallbackValue || undefined;
}

export function readAssistantEventsRemoteTestConfig() {
  const localEnv = readLocalEnvFile();
  const timeoutMs = Number.parseInt(
    readRuntimeValue('ASSISTANT_EVENTS_TEST_TIMEOUT_MS', localEnv) ?? '12000',
    10,
  );
  const requestTimeoutMs = Number.parseInt(
    readRuntimeValue('ASSISTANT_EVENTS_REQUEST_TIMEOUT_MS', localEnv) ??
      String(Math.min(timeoutMs, 8000)),
    10,
  );

  return {
    apiBaseUrl:
      readRuntimeValue('TARGET_AGENT_API_URL', localEnv) ??
      'http://127.0.0.1:4321',
    requestTimeoutMs,
    serviceRoleKey: readRuntimeValue('SUPABASE_SERVICE_ROLE_KEY', localEnv),
    supabaseUrl:
      readRuntimeValue('SUPABASE_URL', localEnv) ??
      readRuntimeValue('PUBLIC_SUPABASE_URL', localEnv),
    timeoutMs,
  };
}

export function createServiceRoleSupabaseClient({
  serviceRoleKey,
  supabaseUrl,
}) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withTimeout(promise, timeoutMs, message) {
  let timeoutId;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function formatRemoteError(error) {
  if (!error) {
    return 'unknown remote error';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error !== 'object') {
    return String(error);
  }

  const candidate = error;
  const parts = [
    typeof candidate.message === 'string' ? `message=${candidate.message}` : undefined,
    typeof candidate.code === 'string' ? `code=${candidate.code}` : undefined,
    typeof candidate.details === 'string'
      ? `details=${candidate.details}`
      : undefined,
    typeof candidate.hint === 'string' ? `hint=${candidate.hint}` : undefined,
    typeof candidate.status === 'number' ? `status=${candidate.status}` : undefined,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(' ');
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
