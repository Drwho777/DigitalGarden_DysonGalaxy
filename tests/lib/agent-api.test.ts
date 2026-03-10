import { beforeEach, describe, expect, it, vi } from 'vitest';

const respondMock = vi.fn();
const logAgentRequestMock = vi.fn();
const logAgentResponseMock = vi.fn();
const logAgentErrorMock = vi.fn();
const recordAssistantEventMock = vi.fn();

vi.mock('../../src/lib/agent/service', () => ({
  agentService: {
    respond: respondMock,
  },
  shouldRequireTeleportTool: (message: string) => /打开|带我|前往/.test(message),
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
  recordAssistantEvent: recordAssistantEventMock,
}));

async function loadRoute() {
  return import('../../src/pages/api/agent');
}

const phase2Cases = [
  '总结当前页面',
  '总结当前星球内容',
  '这个花园主要有哪些内容',
  '我是第一次来，怎么逛比较合适',
] as const;

const phase3Cases = [
  { expectedIntent: 'recommendation', message: '推荐一篇类似的文章' },
  { expectedIntent: 'discovery', message: '最近更新的几个星球' },
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
  beforeEach(() => {
    vi.resetModules();
    respondMock.mockReset();
    logAgentRequestMock.mockReset();
    logAgentResponseMock.mockReset();
    logAgentErrorMock.mockReset();
    recordAssistantEventMock.mockReset();
    respondMock.mockResolvedValue({
      status: 200,
      response: {
        message: '已锁定数字花园日志，准备切入近地轨道。',
        action: {
          type: 'TELEPORT',
          targetType: 'planet',
          targetId: 'p_garden',
        },
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
          message: '总结当前页面',
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
            routeType: 'node',
            starId: 'tech',
            planetId: 'p_garden',
            slug: 'why-3d-galaxy',
          },
          message: '总结当前页面',
        }),
      ),
    } as Parameters<typeof POST>[0]);

    expect(respondMock).toHaveBeenCalledWith({
      context: {
        routeType: 'node',
        starId: 'tech',
        planetId: 'p_garden',
        slug: 'why-3d-galaxy',
      },
      message: '总结当前页面',
      requestId: 'req-test-1',
    });
    expect(response.status).toBe(200);
    expect(recordAssistantEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionIntent: 'content_understanding',
        message: '总结当前页面',
        planetId: 'p_garden',
        routeType: 'node',
        slug: 'why-3d-galaxy',
        starId: 'tech',
        success: true,
      }),
    );
  });

  it.each(phase2Cases)(
    'accepts phase 2 prompt "%s" and forwards it to agentService unchanged',
    async (message) => {
      respondMock.mockResolvedValueOnce({
        status: 200,
        response: {
          message: `handled: ${message}`,
          action: null,
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
        message: `handled: ${message}`,
        action: null,
      });
      expect(recordAssistantEventMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          interactionIntent:
            message === '我是第一次来，怎么逛比较合适'
              ? 'onboarding'
              : 'content_understanding',
          message,
          routeType: 'hub',
          success: true,
        }),
      );
    },
  );

  it.each(phase3Cases)(
    'records phase 3 prompt "%s" with the expected interaction intent',
    async ({ expectedIntent, message }) => {
      respondMock.mockResolvedValueOnce({
        status: 200,
        response: {
          action:
            expectedIntent === 'recommendation'
              ? {
                  type: 'OPEN_PATH',
                  path: '/read/tech/p_garden/astro-3d-performance',
                }
              : {
                  type: 'TELEPORT',
                  targetId: 'p_garden',
                  targetType: 'planet',
                },
          message: `handled: ${message}`,
        },
      });

      const { POST } = await loadRoute();
      const response = await POST({
        request: createRequest(JSON.stringify({ message })),
      } as Parameters<typeof POST>[0]);

      expect(response.status).toBe(200);
      expect(recordAssistantEventMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          actionTargetId:
            expectedIntent === 'recommendation'
              ? '/read/tech/p_garden/astro-3d-performance'
              : 'p_garden',
          actionType:
            expectedIntent === 'recommendation' ? 'OPEN_PATH' : 'TELEPORT',
          interactionIntent: expectedIntent,
          message,
          routeType: 'hub',
          success: true,
        }),
      );
    },
  );

  it('does not block the response when assistant event logging is slow', async () => {
    let resolveEventWrite: (() => void) | undefined;
    recordAssistantEventMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEventWrite = resolve;
        }),
    );

    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest(JSON.stringify({ message: '介绍一下这个网站' })),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    expect(recordAssistantEventMock).toHaveBeenCalledTimes(1);
    resolveEventWrite?.();
  });

  it('formats PostgREST-style assistant event errors without blocking the response', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    recordAssistantEventMock.mockRejectedValueOnce({
      code: '57014',
      details: 'statement timeout',
      hint: 'Retry with a shorter query.',
      message: 'Failed to insert assistant event.',
      status: 504,
    });

    try {
      const { POST } = await loadRoute();
      const response = await POST({
        request: createRequest(JSON.stringify({ message: '介绍一下这个网站' })),
      } as Parameters<typeof POST>[0]);

      expect(response.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[assistant events unavailable]',
        'message=Failed to insert assistant event. code=57014 details=statement timeout hint=Retry with a shorter query. status=504',
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('formats nested fetch-style assistant event errors without blocking the response', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const fetchLikeError = Object.assign(new Error('fetch failed'), {
      cause: {
        code: 'ETIMEDOUT',
        response: {
          status: 503,
          statusText: 'Service Unavailable',
        },
      },
    });

    recordAssistantEventMock.mockRejectedValueOnce(fetchLikeError);

    try {
      const { POST } = await loadRoute();
      const response = await POST({
        request: createRequest(JSON.stringify({ message: '介绍一下这个网站' })),
      } as Parameters<typeof POST>[0]);

      expect(response.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[assistant events unavailable]',
        'message=fetch failed code=ETIMEDOUT status=503 statusText=Service Unavailable',
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('marks whitespace-only requests as unsuccessful assistant events', async () => {
    respondMock.mockResolvedValueOnce({
      status: 422,
      response: {
        message: '`message` is required.',
        action: null,
      },
    });

    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest(JSON.stringify({ message: '   ' })),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(422);
    expect(recordAssistantEventMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        interactionIntent: 'general_chat',
        message: '',
        routeType: 'hub',
        success: false,
      }),
    );
  });

  it('serializes the service result without rewriting the successful contract', async () => {
    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest(
        JSON.stringify({ message: '打开数字花园日志' }),
      ),
    } as Parameters<typeof POST>[0]);

    expect(respondMock).toHaveBeenCalledWith({
      message: '打开数字花园日志',
      requestId: 'req-test-1',
    });
    expect(logAgentRequestMock).toHaveBeenCalledWith({
      isNavigationIntent: true,
      messageLength: '打开数字花园日志'.length,
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
      messageLength: '打开数字花园日志'.length,
      model: '@cf/zai-org/glm-4.7-flash',
      provider: 'cloudflare',
      requestId: 'req-test-1',
      status: 200,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: '已锁定数字花园日志，准备切入近地轨道。',
      action: {
        type: 'TELEPORT',
        targetType: 'planet',
        targetId: 'p_garden',
      },
    });
    expect(recordAssistantEventMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actionTargetId: 'p_garden',
        actionType: 'TELEPORT',
        interactionIntent: 'navigation',
        message: '打开数字花园日志',
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
        JSON.stringify({ message: '打开数字花园日志' }),
      ),
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: '[agent unavailable] failed to reach the Dyson command relay.',
      action: null,
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
      messageLength: '打开数字花园日志'.length,
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
        message: '打开数字花园日志',
        routeType: 'hub',
        success: false,
      }),
    );
  });
});
