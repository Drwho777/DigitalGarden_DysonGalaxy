import { describe, expect, it, vi } from 'vitest';
import { createRuleBasedAgentProvider } from '../../src/lib/agent/providers/rule-based';
import { createAgentService } from '../../src/lib/agent/service';
import type { AgentProvider } from '../../src/lib/agent/types';
import { fixtureHydratedGalaxy } from '../fixtures/galaxy-fixtures';

describe('createAgentService', () => {
  it('returns 422 for empty messages without loading galaxy', async () => {
    const loadGalaxy = vi.fn();
    const provider: AgentProvider = {
      id: 'stub',
      decide: vi.fn(),
    };
    const service = createAgentService({ loadGalaxy, provider });

    const result = await service.respond({ message: '   ' });

    expect(result).toEqual({
      status: 422,
      response: {
        message: '`message` is required.',
        action: null,
      },
    });
    expect(loadGalaxy).not.toHaveBeenCalled();
    expect(provider.decide).not.toHaveBeenCalled();
  });

  it('trims the message before delegating to the provider', async () => {
    const loadGalaxy = vi.fn().mockResolvedValue(fixtureHydratedGalaxy);
    const provider: AgentProvider = {
      id: 'stub',
      decide: vi.fn().mockResolvedValue({
        message: '已锁定数字花园日志，准备切入近地轨道。',
        action: {
          type: 'TELEPORT',
          targetType: 'planet',
          targetId: 'p_garden',
        },
      }),
    };
    const service = createAgentService({ loadGalaxy, provider });

    const result = await service.respond({ message: '  打开数字花园日志  ' });

    expect(loadGalaxy).toHaveBeenCalledTimes(1);
    expect(provider.decide).toHaveBeenCalledWith({
      message: '打开数字花园日志',
      galaxy: fixtureHydratedGalaxy,
    });
    expect(result).toEqual({
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

  it('keeps the p_garden teleport contract with the rule-based provider', async () => {
    const service = createAgentService({
      loadGalaxy: vi.fn().mockResolvedValue(fixtureHydratedGalaxy),
      provider: createRuleBasedAgentProvider(),
    });

    const result = await service.respond({ message: '打开数字花园日志' });

    expect(result).toMatchObject({
      status: 200,
      response: {
        action: {
          type: 'TELEPORT',
          targetType: 'planet',
          targetId: 'p_garden',
        },
      },
    });
  });

  it('normalizes unsupported provider actions back to null', async () => {
    const service = createAgentService({
      loadGalaxy: vi.fn().mockResolvedValue(fixtureHydratedGalaxy),
      provider: {
        id: 'stub',
        decide: vi.fn().mockResolvedValue({
          message: '暂时无法执行该动作。',
          action: {
            type: 'OPEN_PORTAL',
          },
        }),
      },
    });

    const result = await service.respond({ message: '打开传送门' });

    expect(result).toEqual({
      status: 200,
      response: {
        message: '暂时无法执行该动作。',
        action: null,
      },
    });
  });
});
