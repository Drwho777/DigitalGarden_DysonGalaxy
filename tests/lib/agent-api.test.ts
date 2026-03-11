import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const respondMock = vi.fn();
const logAgentRequestMock = vi.fn();
const logAgentResponseMock = vi.fn();
const logAgentErrorMock = vi.fn();
const logAssistantEventDbInsertTimedOutMock = vi.fn();
const recordAssistantEventMock = vi.fn();

vi.mock('../../src/lib/agent/content-intent', () => ({
  resolveInteractionIntent: (message: string) => {
    const normalized = message.trim().toLowerCase();

    if (normalized.startsWith('open ')) {
      return 'navigation';
    }

    if (normalized.includes('recommend')) {
      return 'recommendation';
    }

    if (normalized.includes('recent')) {
      return 'discovery';
    }

    if (normalized.includes('start here')) {
      return 'onboarding';
    }

    if (normalized.includes('summarize')) {
      return 'content_understanding';
    }

    return 'general_chat';
  },
}));

vi.mock('../../src/lib/agent/service', () => ({
  agentService: {
    respond: respondMock,
  },
  shouldRequireTeleportTool: (message: string) => /^open /i.test(message.trim()),
}));

vi.mock('../../src/lib/ai/config', () => ({
  readAIConfigSummary: () => ({
    model: '@cf/zai-org/glm-4.7-flash',
    provider: 'cloudflare',
  }),
}));

vi.mock('../../src/lib/observability/agent-log', () => ({
  createAgentRequestId: () => 'req-test-1',
  logAgentError: logAgentErrorMock,
  logAgentRequest: logAgentRequestMock,
  logAgentResponse: logAgentResponseMock,
}));

vi.mock('../../src/lib/observability/assistant-events', () => ({
  logAssistantEventDbInsertTimedOut: logAssistantEventDbInsertTimedOutMock,
  recordAssistantEvent: recordAssistantEventMock,
}));

async function loadRoute() {
  return import('../../src/pages/api/agent');
}

const phase2Cases = [
  {
    expectedIntent: 'content_understanding',
    message: 'summarize current page',
  },
  {
    expectedIntent: 'onboarding',
    message: 'how do I start here?',
  },
] as const;

const phase3Cases = [
  {
    actionTargetId: null,
    actionType: null,
    expectedIntent: 'recommendation',
    message: 'recommend something similar',
    responseRecommendations: {
      items: [
        {
          action: {
            path: '/read/tech/p_garden/astro-3d-performance',
            type: 'OPEN_PATH',
          },
          description: 'A related performance article.',
          id: 'node:astro-3d-performance',
          kind: 'primary',
          title: 'Astro & Three.js performance',
        },
      ],
      mode: 'recommendation',
    },
  },
  {
    actionTargetId: null,
    actionType: null,
    expectedIntent: 'discovery',
    message: 'what changed recently?',
    responseRecommendations: {
      items: [
        {
          action: {
            targetId: 'p_garden',
            targetType: 'planet',
            type: 'TELEPORT',
          },
          description: 'Recently updated content hub.',
          id: 'planet:p_garden',
          kind: 'primary',
          title: 'Digital Garden Log',
        },
      ],
      mode: 'discovery',
    },
  },
] as const;

function createRequest(body: BodyInit) {
  return new Request('http://localhost/api/agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
}

describe('/api/agent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.resetModules();
    respondMock.mockReset();
    logAgentRequestMock.mockReset();
    logAgentResponseMock.mockReset();
    logAgentErrorMock.mockReset();
    logAssistantEventDbInsertTimedOutMock.mockReset();
    recordAssistantEventMock.mockReset();
    recordAssistantEventMock.mockResolvedValue(undefined);
    respondMock.mockResolvedValue({
      status: 200,
      response: {
        action: {
          targetId: 'p_garden',
          targetType: 'planet',
          type: 'TELEPORT',
        },
        message: 'Locked onto the digital garden log. Preparing local orbit.',
      },
    });
  });

  it('returns 400 for invalid JSON', async () => {
    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest('{'),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      action: null,
      message: 'Invalid JSON request body.',
    });
    expect(respondMock).not.toHaveBeenCalled();
    expect(logAgentRequestMock).not.toHaveBeenCalled();
    expect(logAgentResponseMock).toHaveBeenCalledWith({
      isNavigationIntent: false,
      latencyMs: expect.any(Number),
      messageLength: 0,
      model: '@cf/zai-org/glm-4.7-flash',
      provider: 'cloudflare',
      requestId: 'req-test-1',
      status: 400,
    });
  });

  it('returns 422 when message is missing', async () => {
    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest('{}'),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      action: null,
      message: '`message` is required.',
    });
    expect(respondMock).not.toHaveBeenCalled();
    expect(logAgentRequestMock).not.toHaveBeenCalled();
  });

  it('returns 422 when message is not a string', async () => {
    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest(JSON.stringify({ message: 42 })),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      action: null,
      message: '`message` must be a string.',
    });
    expect(respondMock).not.toHaveBeenCalled();
    expect(logAgentRequestMock).not.toHaveBeenCalled();
  });

  it('returns 422 when context is invalid', async () => {
    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest(
        JSON.stringify({
          context: {
            routeType: 'node',
            starId: 'tech',
          },
          message: 'summarize current page',
        }),
      ),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      action: null,
      message: '`context` is invalid.',
    });
    expect(respondMock).not.toHaveBeenCalled();
    expect(logAgentRequestMock).not.toHaveBeenCalled();
  });

  it('passes validated request context through to agentService', async () => {
    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest(
        JSON.stringify({
          context: {
            planetId: 'p_garden',
            routeType: 'node',
            slug: 'why-3d-galaxy',
            starId: 'tech',
          },
          message: 'summarize current page',
        }),
      ),
    } as Parameters<typeof POST>[0]);

    expect(respondMock).toHaveBeenCalledWith({
      context: {
        planetId: 'p_garden',
        routeType: 'node',
        slug: 'why-3d-galaxy',
        starId: 'tech',
      },
      message: 'summarize current page',
      requestId: 'req-test-1',
    });
    expect(response.status).toBe(200);
    expect(recordAssistantEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionIntent: 'content_understanding',
        message: 'summarize current page',
        planetId: 'p_garden',
        requestId: 'req-test-1',
        routeType: 'node',
        slug: 'why-3d-galaxy',
        starId: 'tech',
        success: true,
      }),
    );
  });

  it.each(phase2Cases)(
    'forwards phase 2 prompt "%s" unchanged and records the expected intent',
    async ({ expectedIntent, message }) => {
      respondMock.mockResolvedValueOnce({
        status: 200,
        response: {
          action: null,
          message: `handled: ${message}`,
        },
      });

      const { POST } = await loadRoute();
      const response = await POST({
        request: createRequest(JSON.stringify({ message })),
      } as Parameters<typeof POST>[0]);

      expect(respondMock).toHaveBeenCalledWith({
        message,
        requestId: 'req-test-1',
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        action: null,
        message: `handled: ${message}`,
      });
      expect(recordAssistantEventMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          interactionIntent: expectedIntent,
          message,
          requestId: 'req-test-1',
          routeType: 'hub',
          success: true,
        }),
      );
    },
  );

  it.each(phase3Cases)(
    'records phase 3 prompt "%s" with the expected interaction intent',
    async ({
      actionTargetId,
      actionType,
      expectedIntent,
      message,
      responseRecommendations,
    }) => {
      respondMock.mockResolvedValueOnce({
        status: 200,
        response: {
          action: null,
          message: `handled: ${message}`,
          recommendations: responseRecommendations,
        },
      });

      const { POST } = await loadRoute();
      const response = await POST({
        request: createRequest(JSON.stringify({ message })),
      } as Parameters<typeof POST>[0]);

      expect(response.status).toBe(200);
      expect(recordAssistantEventMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          actionTargetId,
          actionType,
          interactionIntent: expectedIntent,
          message,
          requestId: 'req-test-1',
          routeType: 'hub',
          success: true,
        }),
      );
    },
  );

  it('waits for assistant event persistence to finish before returning success responses', async () => {
    vi.useFakeTimers();
    let resolveEventWrite: (() => void) | undefined;
    recordAssistantEventMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEventWrite = resolve;
        }),
    );

    const { ASSISTANT_EVENT_WRITE_TIMEOUT_MS, POST } = await loadRoute();
    const responsePromise = Promise.resolve(
      POST({
        request: createRequest(
          JSON.stringify({ message: 'introduce this website' }),
        ),
      } as Parameters<typeof POST>[0]),
    );
    const settledSpy = vi.fn();
    void responsePromise.then(settledSpy);

    await vi.advanceTimersByTimeAsync(ASSISTANT_EVENT_WRITE_TIMEOUT_MS - 1);

    expect(recordAssistantEventMock).toHaveBeenCalledTimes(1);
    expect(settledSpy).not.toHaveBeenCalled();

    resolveEventWrite?.();
    await vi.advanceTimersByTimeAsync(0);

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(logAssistantEventDbInsertTimedOutMock).not.toHaveBeenCalled();
  });

  it('keeps the main response when assistant event persistence times out', async () => {
    vi.useFakeTimers();
    recordAssistantEventMock.mockImplementation(() => new Promise<void>(() => {}));

    const { ASSISTANT_EVENT_WRITE_TIMEOUT_MS, POST } = await loadRoute();
    const responsePromise = Promise.resolve(
      POST({
        request: createRequest(
          JSON.stringify({ message: 'open digital garden log' }),
        ),
      } as Parameters<typeof POST>[0]),
    );
    const settledSpy = vi.fn();
    void responsePromise.then(settledSpy);

    await vi.advanceTimersByTimeAsync(ASSISTANT_EVENT_WRITE_TIMEOUT_MS - 1);
    expect(settledSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(logAssistantEventDbInsertTimedOutMock).toHaveBeenCalledWith({
      actionTargetId: 'p_garden',
      actionType: 'TELEPORT',
      interactionIntent: 'navigation',
      requestId: 'req-test-1',
      timeoutMs: ASSISTANT_EVENT_WRITE_TIMEOUT_MS,
    });
  });

  it('keeps the main response when assistant event persistence fails', async () => {
    recordAssistantEventMock.mockRejectedValueOnce(new Error('insert failed'));

    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest(JSON.stringify({ message: 'introduce this website' })),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    expect(logAssistantEventDbInsertTimedOutMock).not.toHaveBeenCalled();
  });

  it('marks whitespace-only requests as unsuccessful assistant events', async () => {
    respondMock.mockResolvedValueOnce({
      status: 422,
      response: {
        action: null,
        message: '`message` is required.',
      },
    });

    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest(JSON.stringify({ message: '   ' })),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(422);
    expect(recordAssistantEventMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actionTargetId: null,
        actionType: null,
        interactionIntent: 'general_chat',
        message: '',
        requestId: 'req-test-1',
        routeType: 'hub',
        success: false,
      }),
    );
  });

  it('serializes the service result without rewriting the successful contract', async () => {
    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest(
        JSON.stringify({ message: 'open digital garden log' }),
      ),
    } as Parameters<typeof POST>[0]);

    expect(respondMock).toHaveBeenCalledWith({
      message: 'open digital garden log',
      requestId: 'req-test-1',
    });
    expect(logAgentRequestMock).toHaveBeenCalledWith({
      isNavigationIntent: true,
      messageLength: 'open digital garden log'.length,
      model: '@cf/zai-org/glm-4.7-flash',
      provider: 'cloudflare',
      requestId: 'req-test-1',
    });
    expect(logAgentRequestMock.mock.calls[0][0].message).toBeUndefined();
    expect(logAgentResponseMock).toHaveBeenLastCalledWith({
      actionTargetId: 'p_garden',
      actionType: 'TELEPORT',
      isNavigationIntent: true,
      latencyMs: expect.any(Number),
      messageLength: 'open digital garden log'.length,
      model: '@cf/zai-org/glm-4.7-flash',
      provider: 'cloudflare',
      requestId: 'req-test-1',
      status: 200,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      action: {
        targetId: 'p_garden',
        targetType: 'planet',
        type: 'TELEPORT',
      },
      message: 'Locked onto the digital garden log. Preparing local orbit.',
    });
    expect(recordAssistantEventMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actionTargetId: 'p_garden',
        actionType: 'TELEPORT',
        interactionIntent: 'navigation',
        message: 'open digital garden log',
        requestId: 'req-test-1',
        routeType: 'hub',
        success: true,
      }),
    );
  });

  it('returns 500 when the service throws unexpectedly', async () => {
    respondMock.mockRejectedValueOnce(new Error('boom'));

    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest(
        JSON.stringify({ message: 'open digital garden log' }),
      ),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      action: null,
      message: '[agent unavailable] failed to reach the Dyson command relay.',
    });
    expect(logAgentErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
      expect.objectContaining({
        model: '@cf/zai-org/glm-4.7-flash',
        provider: 'cloudflare',
        requestId: 'req-test-1',
        status: 500,
      }),
    );
    expect(logAgentResponseMock).toHaveBeenLastCalledWith({
      isNavigationIntent: true,
      latencyMs: expect.any(Number),
      messageLength: 'open digital garden log'.length,
      model: '@cf/zai-org/glm-4.7-flash',
      provider: 'cloudflare',
      requestId: 'req-test-1',
      status: 500,
    });
    expect(recordAssistantEventMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actionTargetId: null,
        actionType: null,
        interactionIntent: 'navigation',
        message: 'open digital garden log',
        requestId: 'req-test-1',
        routeType: 'hub',
        success: false,
      }),
    );
  });
});
