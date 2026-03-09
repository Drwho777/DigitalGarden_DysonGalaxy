import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureHydratedGalaxy } from '../fixtures/galaxy-fixtures';

async function loadServiceModule() {
  vi.resetModules();
  return import('../../src/lib/agent/service');
}

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
      message: '介绍一下这个网站',
      requestId: 'req-chat-1',
    });

    expect(loadGalaxy).not.toHaveBeenCalled();
    expect(chatResponder.respond).toHaveBeenCalledWith({
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
});
