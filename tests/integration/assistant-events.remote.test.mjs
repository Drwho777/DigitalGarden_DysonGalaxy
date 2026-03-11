import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createServiceRoleSupabaseClient,
  formatRemoteError,
  pollSupabaseQueryUntilMatch,
  readAssistantEventsRemoteTestConfig,
  withTimeout,
} from './assistant-events.remote.helpers.mjs';

const {
  apiBaseUrl,
  requestTimeoutMs,
  serviceRoleKey,
  supabaseUrl,
  timeoutMs,
} = readAssistantEventsRemoteTestConfig();

const TEST_MESSAGE = '\u6700\u8fd1\u66f4\u65b0\u7684\u51e0\u4e2a\u661f\u7403';

test('assistant_events records a real /api/agent request', async () => {
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
  const response = await withTimeout(
    fetch(`${apiBaseUrl}/api/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: {
          routeType: 'node',
          starId: 'tech',
          planetId: 'p_garden',
          slug: 'why-3d-galaxy',
        },
        message: TEST_MESSAGE,
      }),
    }),
    requestTimeoutMs,
    `Timed out calling ${apiBaseUrl}/api/agent after ${requestTimeoutMs}ms.`,
  );

  assert.equal(
    response.ok,
    true,
    `Expected ${apiBaseUrl}/api/agent to succeed, got ${response.status}. Make sure the target server is reachable.`,
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
          .eq('route_type', 'node')
          .eq('star_id', 'tech')
          .eq('planet_id', 'p_garden')
          .eq('slug', 'why-3d-galaxy')
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
  assert.equal(eventRow.interaction_intent, 'discovery');
  assert.equal(eventRow.action_type, 'TELEPORT');
  assert.equal(eventRow.action_target_id, 'p_garden');
  assert.equal(eventRow.success, true);
  assert.equal(typeof eventRow.latency_ms, 'number');
});
