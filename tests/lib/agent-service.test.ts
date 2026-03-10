import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureHydratedGalaxy } from '../fixtures/galaxy-fixtures';

async function loadServiceModule() {
  vi.resetModules();
  return import('../../src/lib/agent/service');
}

const phase2Cases = [
  '总结当前页面',
  '总结当前星球内容',
  '这个花园主要有哪些内容',
  '我是第一次来，怎么逛比较合适',
] as const;

describe('createAgentService', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 422 for empty messages without loading galaxy or invoking chat', async () => {
    const { createAgentService } = await loadServiceModule();
    const loadGalaxy = vi.fn();
    const chatResponder = {
      respond: vi.fn(),
    };
    const service = createAgentService({ chatResponder, loadGalaxy });

    const result = await service.respond({ message: '   ' });

    expect(result).toEqual({
      status: 422,
      response: {
        message: '`message` is required.',
        action: null,
      },
    });
    expect(loadGalaxy).not.toHaveBeenCalled();
    expect(chatResponder.respond).not.toHaveBeenCalled();
  });

  it('resolves a known navigation request locally without invoking chat', async () => {
    const { createAgentService } = await loadServiceModule();
    const loadGalaxy = vi.fn().mockResolvedValue(fixtureHydratedGalaxy);
    const chatResponder = {
      respond: vi.fn(),
    };
    const service = createAgentService({ chatResponder, loadGalaxy });

    const result = await service.respond({
      message: '  带我去数字花园日志  ',
      requestId: 'req-nav-1',
    });

    expect(loadGalaxy).toHaveBeenCalledTimes(1);
    expect(chatResponder.respond).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 200,
      response: {
        message: '跃迁坐标已锁定，准备执行传送。',
        action: {
          type: 'TELEPORT',
          targetId: 'p_garden',
          targetType: 'planet',
        },
      },
    });
  });

  it('resolves short aliases like 去日志 locally without invoking chat', async () => {
    const { createAgentService } = await loadServiceModule();
    const loadGalaxy = vi.fn().mockResolvedValue(fixtureHydratedGalaxy);
    const chatResponder = {
      respond: vi.fn(),
    };
    const service = createAgentService({ chatResponder, loadGalaxy });

    const result = await service.respond({ message: '去日志' });

    expect(loadGalaxy).toHaveBeenCalledTimes(1);
    expect(chatResponder.respond).not.toHaveBeenCalled();
    expect(result.response.action).toEqual({
      type: 'TELEPORT',
      targetId: 'p_garden',
      targetType: 'planet',
    });
  });

  it('returns a local not_found response for unknown navigation requests', async () => {
    const { createAgentService } = await loadServiceModule();
    const loadGalaxy = vi.fn().mockResolvedValue(fixtureHydratedGalaxy);
    const chatResponder = {
      respond: vi.fn(),
    };
    const service = createAgentService({ chatResponder, loadGalaxy });

    const result = await service.respond({ message: '打开关于我' });

    expect(loadGalaxy).toHaveBeenCalledTimes(1);
    expect(chatResponder.respond).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 200,
      response: {
        message: '无法在当前星图中定位该目标，我可以带你前往工程、哲学或 ACG 领域。',
        action: null,
      },
    });
  });

  it('delegates non-navigation requests to chat responder', async () => {
    const { createAgentService } = await loadServiceModule();
    const loadGalaxy = vi.fn();
    const context = {
      routeType: 'node' as const,
      starId: 'tech',
      planetId: 'p_garden',
      slug: 'why-3d-galaxy',
    };
    const chatResponder = {
      respond: vi.fn().mockResolvedValue({
        status: 200,
        response: {
          message: '这里是一个 3D 数字花园。',
          action: null,
        },
      }),
    };
    const service = createAgentService({ chatResponder, loadGalaxy });

    const result = await service.respond({
      context,
      message: '介绍一下这个网站',
      requestId: 'req-chat-1',
    });

    expect(loadGalaxy).not.toHaveBeenCalled();
    expect(chatResponder.respond).toHaveBeenCalledWith({
      context,
      message: '介绍一下这个网站',
      requestId: 'req-chat-1',
    });
    expect(result).toEqual({
      status: 200,
      response: {
        message: '这里是一个 3D 数字花园。',
        action: null,
      },
    });
  });

  it('treats current-page summary requests as chat instead of local navigation', async () => {
    const { createAgentService } = await loadServiceModule();
    const loadGalaxy = vi.fn();
    const context = {
      routeType: 'node' as const,
      starId: 'tech',
      planetId: 'p_garden',
      slug: 'why-3d-galaxy',
    };
    const chatResponder = {
      respond: vi.fn().mockResolvedValue({
        status: 200,
        response: {
          message: '当前这篇文章主要在解释知识结构设计。',
          action: null,
        },
      }),
    };
    const service = createAgentService({ chatResponder, loadGalaxy });

    const result = await service.respond({
      context,
      message: '总结当前页面',
      requestId: 'req-chat-summary',
    });

    expect(loadGalaxy).not.toHaveBeenCalled();
    expect(chatResponder.respond).toHaveBeenCalledWith({
      context,
      message: '总结当前页面',
      requestId: 'req-chat-summary',
    });
    expect(result.response.action).toBeNull();
  });

  it.each(phase2Cases)('routes phase 2 prompt "%s" through chat', async (message) => {
    const { createAgentService } = await loadServiceModule();
    const loadGalaxy = vi.fn();
    const chatResponder = {
      respond: vi.fn().mockResolvedValue({
        status: 200,
        response: {
          message: `handled: ${message}`,
          action: null,
        },
      }),
    };
    const service = createAgentService({ chatResponder, loadGalaxy });

    const result = await service.respond({ message });

    expect(loadGalaxy).not.toHaveBeenCalled();
    expect(chatResponder.respond).toHaveBeenCalledWith({ message });
    expect(result.response).toEqual({
      message: `handled: ${message}`,
      action: null,
    });
  });
});
