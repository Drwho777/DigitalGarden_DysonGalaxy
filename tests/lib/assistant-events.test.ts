import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({
  insert: insertMock,
}));
const createServerSupabaseClientMock = vi.fn(() => ({
  from: fromMock,
}));

vi.mock('../../src/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

async function loadAssistantEventsModule() {
  vi.resetModules();
  return import('../../src/lib/observability/assistant-events');
}

describe('recordAssistantEvent', () => {
  beforeEach(() => {
    vi.resetModules();
    insertMock.mockReset();
    fromMock.mockClear();
    createServerSupabaseClientMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
  });

  it('records assistant events with scope, latency, and lifecycle logs', async () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { recordAssistantEvent } = await loadAssistantEventsModule();

    try {
      await recordAssistantEvent({
        actionTargetId: null,
        actionType: null,
        interactionIntent: 'content_understanding',
        latencyMs: 320,
        message: 'summarize the current page',
        planetId: 'p_garden',
        requestId: 'req-test-1',
        routeType: 'node',
        slug: 'why-3d-galaxy',
        starId: 'tech',
        success: true,
      });

      expect(createServerSupabaseClientMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledWith('assistant_events');
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          interaction_intent: 'content_understanding',
          latency_ms: 320,
          message: 'summarize the current page',
          planet_id: 'p_garden',
          route_type: 'node',
          slug: 'why-3d-galaxy',
          star_id: 'tech',
          success: true,
        }),
      );

      expect(consoleInfoSpy).toHaveBeenCalledTimes(2);
      expect(JSON.parse(consoleInfoSpy.mock.calls[0][0])).toEqual({
        event: 'assistant_event.db_insert_started',
        interactionIntent: 'content_understanding',
        path: '/api/agent',
        requestId: 'req-test-1',
      });
      expect(JSON.parse(consoleInfoSpy.mock.calls[1][0])).toEqual({
        event: 'assistant_event.db_insert_succeeded',
        interactionIntent: 'content_understanding',
        path: '/api/agent',
        requestId: 'req-test-1',
      });
    } finally {
      consoleInfoSpy.mockRestore();
    }
  });

  it('logs PostgREST-style insert errors before rethrowing them', async () => {
    insertMock.mockResolvedValue({
      error: {
        code: '57014',
        details: 'statement timeout',
        hint: 'Retry with a shorter query.',
        message: 'Failed to insert assistant event.',
        status: 504,
      },
    });
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { recordAssistantEvent } = await loadAssistantEventsModule();

    try {
      await expect(
        recordAssistantEvent({
          interactionIntent: 'general_chat',
          latencyMs: 25,
          message: 'introduce this website',
          requestId: 'req-test-2',
          routeType: 'hub',
          success: true,
        }),
      ).rejects.toMatchObject({
        code: '57014',
      });

      expect(JSON.parse(consoleErrorSpy.mock.calls[0][0])).toEqual({
        errorSummary:
          'message=Failed to insert assistant event. code=57014 details=statement timeout hint=Retry with a shorter query. status=504',
        event: 'assistant_event.db_insert_failed',
        interactionIntent: 'general_chat',
        path: '/api/agent',
        requestId: 'req-test-2',
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('logs nested fetch-style insert errors before rethrowing them', async () => {
    const fetchLikeError = Object.assign(new Error('fetch failed'), {
      cause: {
        code: 'ETIMEDOUT',
        response: {
          status: 503,
          statusText: 'Service Unavailable',
        },
      },
    });
    insertMock.mockRejectedValue(fetchLikeError);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { recordAssistantEvent } = await loadAssistantEventsModule();

    try {
      await expect(
        recordAssistantEvent({
          actionTargetId: 'p_garden',
          actionType: 'TELEPORT',
          interactionIntent: 'navigation',
          latencyMs: 48,
          message: 'open digital garden log',
          requestId: 'req-test-3',
          routeType: 'hub',
          success: true,
        }),
      ).rejects.toThrow('fetch failed');

      expect(JSON.parse(consoleErrorSpy.mock.calls[0][0])).toEqual({
        actionTargetId: 'p_garden',
        actionType: 'TELEPORT',
        errorSummary:
          'message=fetch failed code=ETIMEDOUT status=503 statusText=Service Unavailable',
        event: 'assistant_event.db_insert_failed',
        interactionIntent: 'navigation',
        path: '/api/agent',
        requestId: 'req-test-3',
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
