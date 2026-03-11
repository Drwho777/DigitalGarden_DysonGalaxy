import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { parse as parseDotenv } from 'dotenv';

function readLocalEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  return parseDotenv(readFileSync(envPath, 'utf8'));
}

function readRuntimeValue(key, fallbackEnv = {}) {
  const processValue = process.env[key]?.trim();
  if (processValue) {
    return processValue;
  }

  const fallbackValue = fallbackEnv[key]?.trim();
  return fallbackValue || undefined;
}

function normalizeApiBaseUrl(value) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return undefined;
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  return withProtocol.replace(/\/+$/u, '');
}

function assertRemoteApiBaseUrl(apiBaseUrl, envKey) {
  if (!apiBaseUrl) {
    return;
  }

  const url = new URL(apiBaseUrl);
  const hostname = url.hostname.toLowerCase();
  const isLoopbackHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]';

  if (isLoopbackHost) {
    throw new Error(
      `${envKey} must point to a remote deployment URL, not ${hostname}.`,
    );
  }
}

export function readAssistantEventsRemoteTestConfig(options = {}) {
  const {
    apiBaseUrlEnvKey = 'TARGET_AGENT_API_URL',
    defaultRequestTimeoutMs,
    defaultTimeoutMs = 12000,
    fallbackApiBaseUrl = 'http://127.0.0.1:4321',
    requestTimeoutEnvKey = 'ASSISTANT_EVENTS_REQUEST_TIMEOUT_MS',
    timeoutEnvKey = 'ASSISTANT_EVENTS_TEST_TIMEOUT_MS',
  } = options;
  const localEnv = readLocalEnvFile();
  const timeoutMs = Number.parseInt(
    readRuntimeValue(timeoutEnvKey, localEnv) ?? String(defaultTimeoutMs),
    10,
  );
  const resolvedDefaultRequestTimeoutMs =
    defaultRequestTimeoutMs ?? Math.min(timeoutMs, 8000);
  const requestTimeoutMs = Number.parseInt(
    readRuntimeValue(requestTimeoutEnvKey, localEnv) ??
      String(resolvedDefaultRequestTimeoutMs),
    10,
  );
  const configuredApiBaseUrl = readRuntimeValue(apiBaseUrlEnvKey, localEnv);
  const apiBaseUrl = normalizeApiBaseUrl(
    configuredApiBaseUrl ?? fallbackApiBaseUrl,
  );

  if (configuredApiBaseUrl && apiBaseUrlEnvKey === 'VERCEL_AGENT_API_URL') {
    assertRemoteApiBaseUrl(apiBaseUrl, apiBaseUrlEnvKey);
  }

  return {
    apiBaseUrl,
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

export function isRetryableRemoteError(error) {
  const formatted = formatRemoteError(error).toLowerCase();

  return (
    formatted.includes('fetch failed') ||
    formatted.includes('connect timeout') ||
    formatted.includes('und_err_connect_timeout') ||
    formatted.includes('timed out calling') ||
    formatted.includes('timed out reading') ||
    formatted.includes('etimedout') ||
    formatted.includes('econnreset') ||
    formatted.includes('eai_again')
  );
}

export async function retryRemoteOperation(options) {
  const {
    execute,
    retryIntervalMs = 500,
    timeoutMessage,
    timeoutMs,
  } = options;
  const deadline = Date.now() + timeoutMs;
  let lastRetryableError = null;

  while (Date.now() < deadline) {
    try {
      return await execute();
    } catch (error) {
      if (!isRetryableRemoteError(error)) {
        throw error;
      }

      lastRetryableError = error;
      await sleep(retryIntervalMs);
    }
  }

  throw new Error(
    lastRetryableError
      ? `${timeoutMessage} Last retryable error: ${formatRemoteError(lastRetryableError)}`
      : timeoutMessage,
  );
}

export async function pollSupabaseQueryUntilMatch(options) {
  const {
    buildQuery,
    emptyResultMessage,
    pollIntervalMs = 500,
    requestTimeoutMs,
    timeoutMs,
    timeoutMessage,
  } = options;
  const deadline = Date.now() + timeoutMs;
  let lastRetryableError = null;

  while (Date.now() < deadline) {
    try {
      const { data, error } = await withTimeout(
        buildQuery(),
        requestTimeoutMs,
        timeoutMessage,
      );

      if (error) {
        if (isRetryableRemoteError(error)) {
          lastRetryableError = error;
          await sleep(pollIntervalMs);
          continue;
        }

        return {
          error,
          row: null,
        };
      }

      if (data && data.length > 0) {
        return {
          error: null,
          row: data[0],
        };
      }
    } catch (error) {
      if (isRetryableRemoteError(error)) {
        lastRetryableError = error;
        await sleep(pollIntervalMs);
        continue;
      }

      throw error;
    }

    await sleep(pollIntervalMs);
  }

  return {
    error: lastRetryableError,
    row: null,
    timeoutMessage: lastRetryableError
      ? `${emptyResultMessage} Last retryable error: ${formatRemoteError(lastRetryableError)}`
      : emptyResultMessage,
  };
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
