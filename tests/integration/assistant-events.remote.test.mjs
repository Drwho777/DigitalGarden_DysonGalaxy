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
  defaultRequestTimeoutMs: 20000,
  defaultTimeoutMs: 30000,
});
const effectiveRequestTimeoutMs = Math.max(requestTimeoutMs, 20000);
const effectiveTimeoutMs = Math.max(timeoutMs, 30000);

const ASSISTANT_EVENT_COLUMNS =
  'message, route_type, star_id, planet_id, slug, interaction_intent, action_type, action_target_id, success, latency_ms, created_at';
const NAVIGATION_PROMPT = '打开数字花园日志';
const HUB_OVERVIEW_PROMPT = '这个花园主要有哪些内容';

function createFingerprintedMessage(prompt, label) {
  return `${prompt} [assistant-events-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}]`;
}

test('assistant_events records real /api/agent navigation and Phase 2 hub requests', async (t) => {
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

  const scenarios = [
    {
      assertPayload(payload) {
        assert.equal(typeof payload.message, 'string');
        assert.equal(payload.action?.type, 'TELEPORT');
        assert.equal(payload.action?.targetId, 'p_garden');
      },
      expectedActionTargetId: 'p_garden',
      expectedActionType: 'TELEPORT',
      expectedIntent: 'navigation',
      message: createFingerprintedMessage(NAVIGATION_PROMPT, 'nav'),
      name: 'hub navigation request',
    },
    {
      assertPayload(payload) {
        assert.equal(typeof payload.message, 'string');
        assert.equal(payload.action, null);
      },
      expectedActionTargetId: null,
      expectedActionType: null,
      expectedIntent: 'content_understanding',
      message: createFingerprintedMessage(HUB_OVERVIEW_PROMPT, 'hub-overview'),
      name: 'hub overview Phase 2 request',
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
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
                message: scenario.message,
              }),
            }),
            effectiveRequestTimeoutMs,
            `Timed out calling ${apiBaseUrl}/api/agent after ${effectiveRequestTimeoutMs}ms.`,
          ),
        timeoutMessage: `Failed to call ${apiBaseUrl}/api/agent within ${effectiveTimeoutMs}ms.`,
        timeoutMs: effectiveTimeoutMs,
      });

      assert.equal(
        response.ok,
        true,
        `Expected ${apiBaseUrl}/api/agent to succeed, got ${response.status}. Make sure the target server is reachable.`,
      );

      const payload = await response.json();
      scenario.assertPayload(payload);

      const { error, row: eventRow, timeoutMessage } =
        await pollSupabaseQueryUntilMatch({
          buildQuery: () =>
            supabase
              .from('assistant_events')
              .select(ASSISTANT_EVENT_COLUMNS)
              .eq('message', scenario.message)
              .eq('route_type', 'hub')
              .gte('created_at', requestStartedAt)
              .order('created_at', { ascending: false })
              .limit(1),
          emptyResultMessage: `Did not observe a matching assistant_events row within ${effectiveTimeoutMs}ms.`,
          requestTimeoutMs: effectiveRequestTimeoutMs,
          timeoutMessage: `Timed out reading assistant_events from ${supabaseUrl} after ${effectiveRequestTimeoutMs}ms.`,
          timeoutMs: effectiveTimeoutMs,
        });

      assert.equal(
        error,
        null,
        formatRemoteError(error) ?? 'assistant_events query failed',
      );
      assert.ok(
        eventRow,
        timeoutMessage ??
          `Did not observe a matching assistant_events row within ${effectiveTimeoutMs}ms.`,
      );
      assert.equal(eventRow.interaction_intent, scenario.expectedIntent);
      assert.equal(eventRow.action_type, scenario.expectedActionType);
      assert.equal(eventRow.action_target_id, scenario.expectedActionTargetId);
      assert.equal(eventRow.success, true);
      assert.equal(typeof eventRow.latency_ms, 'number');
    });
  }
});
