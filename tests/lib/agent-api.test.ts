import { beforeEach, describe, expect, it, vi } from 'vitest';

const respondMock = vi.fn();
const logAgentRequestMock = vi.fn();
const logAgentResponseMock = vi.fn();

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
  logAgentRequest: logAgentRequestMock,
  logAgentResponse: logAgentResponseMock,
}));

async function loadRoute() {
  return import('../../src/pages/api/agent');
}

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
  });
});
