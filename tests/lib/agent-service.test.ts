import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureHydratedGalaxy } from '../fixtures/galaxy-fixtures';

const generateTextMock = vi.fn();
const createGoogleGenerativeAIMock = vi.fn();

vi.mock('ai', () => ({
  generateText: generateTextMock,
  stepCountIs: (count: number) => ({ count, type: 'step-count' }),
  tool: <T>(definition: T) => definition,
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: createGoogleGenerativeAIMock,
}));

async function loadServiceModule() {
  return import('../../src/lib/agent/service');
}

describe('createAgentService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    generateTextMock.mockReset();
    createGoogleGenerativeAIMock.mockReset();
    createGoogleGenerativeAIMock.mockImplementation(() => {
      return (modelId: string) => `mock-model:${modelId}`;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 422 for empty messages without loading galaxy', async () => {
    const { createAgentService } = await loadServiceModule();
    const loadGalaxy = vi.fn();
    const service = createAgentService({ loadGalaxy });

    const result = await service.respond({ message: '   ' });

    expect(result).toEqual({
      status: 422,
      response: {
        message: '`message` is required.',
        action: null,
      },
    });
    expect(loadGalaxy).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('returns a TELEPORT action when the model calls teleport_engine', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-key');
    generateTextMock.mockImplementation(async (options: any) => {
      await options.tools.teleport_engine.execute({ targetId: '数字花园日志' });

      return {
        text: '已锁定数字花园日志，准备切入近地轨道。',
        toolCalls: [
          {
            input: { targetId: '数字花园日志' },
            toolName: 'teleport_engine',
          },
        ],
        toolResults: [],
      };
    });

    const { createAgentService } = await loadServiceModule();
    const loadGalaxy = vi.fn().mockResolvedValue(fixtureHydratedGalaxy);
    const service = createAgentService({ loadGalaxy });

    const result = await service.respond({ message: '  打开数字花园日志  ' });

    expect(loadGalaxy).toHaveBeenCalledTimes(1);
    expect(createGoogleGenerativeAIMock).toHaveBeenCalledWith({
      apiKey: 'test-key',
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock.mock.calls[0][0]).toMatchObject({
      model: 'mock-model:gemini-2.5-flash',
      prompt: '打开数字花园日志',
      toolChoice: 'required',
    });
    expect(generateTextMock.mock.calls[0][0].system).toContain('teleport_engine');
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

  it('keeps action null when the model responds without a tool call', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-key');
    generateTextMock.mockResolvedValue({
      text: '当前指令还没有对应的星区，我可以带你前往工程、哲学或 ACG 领域。',
      toolCalls: [],
      toolResults: [],
    });

    const { createAgentService } = await loadServiceModule();
    const service = createAgentService({
      loadGalaxy: vi.fn().mockResolvedValue(fixtureHydratedGalaxy),
    });

    const result = await service.respond({ message: '今天天气怎么样' });

    expect(generateTextMock.mock.calls[0][0].toolChoice).toBe('auto');
    expect(result).toEqual({
      status: 200,
      response: {
        message: '当前指令还没有对应的星区，我可以带你前往工程、哲学或 ACG 领域。',
        action: null,
      },
    });
  });

  it('returns a readable response when GOOGLE_GENERATIVE_AI_API_KEY is missing', async () => {
    const { createAgentService } = await loadServiceModule();
    const loadGalaxy = vi.fn();
    const service = createAgentService({ loadGalaxy });

    const result = await service.respond({ message: '带我去工程星系' });

    expect(result).toEqual({
      status: 503,
      response: {
        message:
          '[agent unavailable] GOOGLE_GENERATIVE_AI_API_KEY is not configured.',
        action: null,
      },
    });
    expect(loadGalaxy).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('keeps action null when the model calls teleport_engine with an unknown target', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-key');
    generateTextMock.mockImplementation(async (options: any) => {
      await options.tools.teleport_engine.execute({ targetId: 'missing' });

      return {
        text: '无法在当前星图中定位该目标。',
        toolCalls: [
          {
            input: { targetId: 'missing' },
            toolName: 'teleport_engine',
          },
        ],
        toolResults: [],
      };
    });

    const { createAgentService } = await loadServiceModule();
    const service = createAgentService({
      loadGalaxy: vi.fn().mockResolvedValue(fixtureHydratedGalaxy),
    });

    const result = await service.respond({ message: '带我去不存在的星球' });

    expect(result).toEqual({
      status: 200,
      response: {
        message: '无法在当前星图中定位该目标。',
        action: null,
      },
    });
  });
});
