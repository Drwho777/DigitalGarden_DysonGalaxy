import { beforeEach, describe, expect, it, vi } from 'vitest';

const respondMock = vi.fn();

vi.mock('../../src/lib/agent/service', () => ({
  agentService: {
    respond: respondMock,
  },
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
  });

  it('serializes the service result without rewriting the successful contract', async () => {
    const { POST } = await loadRoute();
    const response = await POST({
      request: createRequest(
        JSON.stringify({ message: '打开数字花园日志' }),
      ),
    } as Parameters<typeof POST>[0]);

    expect(respondMock).toHaveBeenCalledWith({ message: '打开数字花园日志' });
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
