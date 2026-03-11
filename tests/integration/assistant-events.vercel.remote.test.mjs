import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createServiceRoleSupabaseClient,
  formatRemoteError,
  pollSupabaseQueryUntilMatch,
  readAssistantEventsRemoteTestConfig,
  retryRemoteOperation,
  withTimeout,
} from './assistant-events.remote.helpers.mjs';

const {
  apiBaseUrl,
  requestTimeoutMs,
  serviceRoleKey,
  supabaseUrl,
  timeoutMs,
} = readAssistantEventsRemoteTestConfig({
  apiBaseUrlEnvKey: 'VERCEL_AGENT_API_URL',
  defaultRequestTimeoutMs: 15000,
  defaultTimeoutMs: 30000,
  fallbackApiBaseUrl: undefined,
  requestTimeoutEnvKey: 'VERCEL_ASSISTANT_EVENTS_REQUEST_TIMEOUT_MS',
  timeoutEnvKey: 'VERCEL_ASSISTANT_EVENTS_TEST_TIMEOUT_MS',
});

const TEST_MESSAGE = '\u6253\u5f00\u6570\u5b57\u82b1\u56ed\u65e5\u5fd7';

test('assistant_events records a real Vercel navigation request', async () => {
  assert.ok(
    apiBaseUrl,
    'VERCEL_AGENT_API_URL is required for Vercel deployment verification.',
  );
  assert.ok(
    supabaseUrl,
    'SUPABASE_URL (or PUBLIC_SUPABASE_URL) is required for integration verification.',
  );
  assert.ok(
    serviceRoleKey,
    'SUPABASE_SERVICE_ROLE_KEY is required for integration verification.',
  );

  const supabase = createServiceRoleSupabaseClient({
    serviceRoleKey,
    supabaseUrl,
  });

  const requestStartedAt = new Date().toISOString();
  const response = await retryRemoteOperation({
    execute: () =>
      withTimeout(
        fetch(`${apiBaseUrl}/api/agent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: TEST_MESSAGE,
          }),
        }),
        requestTimeoutMs,
        `Timed out calling ${apiBaseUrl}/api/agent after ${requestTimeoutMs}ms.`,
      ),
    timeoutMessage: `Failed to call ${apiBaseUrl}/api/agent within ${timeoutMs}ms.`,
    timeoutMs,
  });

  assert.equal(
    response.ok,
    true,
    `Expected ${apiBaseUrl}/api/agent to succeed, got ${response.status}. Make sure the Vercel deployment is reachable.`,
  );

  const payload = await response.json();
  assert.equal(typeof payload.message, 'string');
  assert.equal(payload.action?.type, 'TELEPORT');
  assert.equal(payload.action?.targetId, 'p_garden');

  const { error, row: eventRow, timeoutMessage } =
    await pollSupabaseQueryUntilMatch({
      buildQuery: () =>
        supabase
          .from('assistant_events')
          .select(
            'message, route_type, star_id, planet_id, slug, interaction_intent, action_type, action_target_id, success, latency_ms, created_at',
          )
          .eq('message', TEST_MESSAGE)
          .eq('route_type', 'hub')
          .gte('created_at', requestStartedAt)
          .order('created_at', { ascending: false })
          .limit(1),
      emptyResultMessage: `Did not observe a matching assistant_events row within ${timeoutMs}ms.`,
      requestTimeoutMs,
      timeoutMessage: `Timed out reading assistant_events from ${supabaseUrl} after ${requestTimeoutMs}ms.`,
      timeoutMs,
    });

  assert.equal(
    error,
    null,
    formatRemoteError(error) ?? 'assistant_events query failed',
  );

  assert.ok(
    eventRow,
    timeoutMessage ?? `Did not observe a matching assistant_events row within ${timeoutMs}ms.`,
  );
  assert.equal(eventRow.interaction_intent, 'navigation');
  assert.equal(eventRow.action_type, 'TELEPORT');
  assert.equal(eventRow.action_target_id, 'p_garden');
  assert.equal(eventRow.success, true);
  assert.equal(typeof eventRow.latency_ms, 'number');
});
