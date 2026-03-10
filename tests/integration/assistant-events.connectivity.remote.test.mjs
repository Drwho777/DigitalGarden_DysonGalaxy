import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createServiceRoleSupabaseClient,
  formatRemoteError,
  readAssistantEventsRemoteTestConfig,
  withTimeout,
} from './assistant-events.remote.helpers.mjs';

const {
  requestTimeoutMs,
  serviceRoleKey,
  supabaseUrl,
} = readAssistantEventsRemoteTestConfig();

test('remote Supabase assistant_events table is reachable', async () => {
  assert.ok(
    supabaseUrl,
    'SUPABASE_URL (or PUBLIC_SUPABASE_URL) is required for connectivity verification.',
  );
  assert.ok(
    serviceRoleKey,
    'SUPABASE_SERVICE_ROLE_KEY is required for connectivity verification.',
  );

  const supabase = createServiceRoleSupabaseClient({
    serviceRoleKey,
    supabaseUrl,
  });

  const { data, error } = await withTimeout(
    supabase
      .from('assistant_events')
      .select('created_at')
      .limit(1),
    requestTimeoutMs,
    `Timed out reading assistant_events from ${supabaseUrl} after ${requestTimeoutMs}ms.`,
  );

  assert.equal(
    error,
    null,
    formatRemoteError(error) ?? 'assistant_events connectivity query failed',
  );
  assert.ok(
    Array.isArray(data),
    'Expected assistant_events connectivity query to return an array.',
  );
});
