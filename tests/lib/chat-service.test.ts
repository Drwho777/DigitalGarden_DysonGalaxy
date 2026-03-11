import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIConfigError } from '../../src/lib/ai/config';
import {
  fixtureLoadedHubContext,
  fixtureLoadedNodeContext,
  fixtureLoadedPlanetContext,
} from '../fixtures/galaxy-fixtures';

const generateTextMock = vi.fn();
const logAgentErrorMock = vi.fn();
const searchKnowledgeMock = vi.fn();

function createCloudflareModelContext(model: any) {
  return {
    config: {
      accountId: 'account-123',
      apiKey: 'cloudflare-key',
      model: '@cf/meta/llama-4-scout-17b-16e-instruct',
      provider: 'cloudflare' as const,
    },
    model,
  };
}

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('../../src/lib/observability/agent-log', () => ({
  logAgentError: logAgentErrorMock,
}));

async function loadChatServiceModule() {
  vi.resetModules();
  return import('../../src/lib/agent/chat-service');
}

describe('createChatService', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    logAgentErrorMock.mockReset();
    searchKnowledgeMock.mockReset();
  });

  it('returns 422 for empty messages without loading context or resolving a model', async () => {
    const { createChatService } = await loadChatServiceModule();
    const loadContext = vi.fn();
    const resolveModel = vi.fn();
    const service = createChatService({
      loadContext,
      resolveModel,
      searchKnowledge: searchKnowledgeMock,
    });

    const result = await service.respond({ message: '   ' });

    expect(result).toEqual({
      status: 422,
      response: {
        message: '`message` is required.',
        action: null,
      },
    });
    expect(loadContext).not.toHaveBeenCalled();
    expect(resolveModel).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('builds a scope-aware prompt for current-page summaries', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    const resolveModel = vi.fn(() => createCloudflareModelContext(mockModel));

    generateTextMock.mockResolvedValue({
      text: '当前这篇文章主要在解释为什么要用 3D 星系重建知识结构。',
    });

    const { createChatService } = await loadChatServiceModule();
    const loadContext = vi.fn().mockResolvedValue(fixtureLoadedNodeContext);
    const service = createChatService({
      loadContext,
      resolveModel,
      searchKnowledge: searchKnowledgeMock,
    });

    const result = await service.respond({
      context: {
        routeType: 'node',
        starId: 'tech',
        planetId: 'p_garden',
        slug: 'why-3d-galaxy',
      },
      message: '总结当前页面',
    });

    expect(resolveModel).toHaveBeenCalledTimes(1);
    expect(loadContext).toHaveBeenCalledWith({
      routeType: 'node',
      starId: 'tech',
      planetId: 'p_garden',
      slug: 'why-3d-galaxy',
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock.mock.calls[0][0]).toMatchObject({
      model: mockModel,
      prompt: '总结当前页面',
    });
    expect(generateTextMock.mock.calls[0][0].toolChoice).toBeUndefined();
    expect(generateTextMock.mock.calls[0][0].tools).toBeUndefined();
    expect(generateTextMock.mock.calls[0][0].stopWhen).toBeUndefined();
    expect(generateTextMock.mock.calls[0][0].system).toContain(
      '交互意图：content_understanding',
    );
    expect(generateTextMock.mock.calls[0][0].system).toContain('当前作用域：node');
    expect(generateTextMock.mock.calls[0][0].system).toContain('只总结当前文章');
    expect(generateTextMock.mock.calls[0][0].system).toContain('当前文章：');
    expect(searchKnowledgeMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 200,
      response: {
        message: '当前这篇文章主要在解释为什么要用 3D 星系重建知识结构。',
        action: null,
      },
    });
    expect(logAgentErrorMock).not.toHaveBeenCalled();
  });

  it('keeps generic chat grounded in hub scope without navigation tools or loop control', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    const resolveModel = vi.fn(() => createCloudflareModelContext(mockModel));

    generateTextMock.mockResolvedValue({
      text: '这是一个关于 3D 数字花园的实验网站。',
    });

    const { createChatService } = await loadChatServiceModule();
    const loadContext = vi.fn().mockResolvedValue(fixtureLoadedHubContext);
    const service = createChatService({
      loadContext,
      resolveModel,
      searchKnowledge: searchKnowledgeMock,
    });

    const result = await service.respond({ message: '介绍一下这个网站' });

    expect(resolveModel).toHaveBeenCalledTimes(1);
    expect(loadContext).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock.mock.calls[0][0]).toMatchObject({
      model: mockModel,
      prompt: '介绍一下这个网站',
    });
    expect(generateTextMock.mock.calls[0][0].toolChoice).toBeUndefined();
    expect(generateTextMock.mock.calls[0][0].tools).toBeUndefined();
    expect(generateTextMock.mock.calls[0][0].stopWhen).toBeUndefined();
    expect(generateTextMock.mock.calls[0][0].system).toContain(
      '你当前只负责解释、总结、推荐与介绍',
    );
    expect(generateTextMock.mock.calls[0][0].system).toContain(
      '交互意图：general_chat',
    );
    expect(generateTextMock.mock.calls[0][0].system).toContain('当前作用域：hub');
    expect(searchKnowledgeMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 200,
      response: {
        message: '这是一个关于 3D 数字花园的实验网站。',
        action: null,
      },
    });
    expect(logAgentErrorMock).not.toHaveBeenCalled();
  });

  it('builds a planet-scope prompt for current-planet summaries', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    const resolveModel = vi.fn(() => createCloudflareModelContext(mockModel));

    generateTextMock.mockResolvedValue({
      text: '当前这个星球主要聚焦数字花园的构建记录和知识结构设计。',
    });

    const { createChatService } = await loadChatServiceModule();
    const loadContext = vi.fn().mockResolvedValue(fixtureLoadedPlanetContext);
    searchKnowledgeMock.mockResolvedValue([
      {
        chunkIndex: 0,
        contentChunk: '数字花园日志主要记录 3D 星系知识结构的构建过程。',
        nodeId: 'node-1',
        similarity: 0.92,
      },
    ]);
    const service = createChatService({
      loadContext,
      resolveModel,
      semanticRetrievalEnabled: () => true,
      searchKnowledge: searchKnowledgeMock,
    });

    await service.respond({
      context: {
        routeType: 'planet',
        starId: 'tech',
        planetId: 'p_garden',
      },
      message: '总结当前星球内容',
    });

    expect(generateTextMock.mock.calls[0][0].system).toContain(
      '交互意图：content_understanding',
    );
    expect(generateTextMock.mock.calls[0][0].system).toContain(
      '当前作用域：planet',
    );
    expect(generateTextMock.mock.calls[0][0].system).toContain('优先总结当前星球');
    expect(generateTextMock.mock.calls[0][0].system).toContain('当前星球：');
    expect(generateTextMock.mock.calls[0][0].system).toContain('语义检索补充：');
    expect(searchKnowledgeMock).toHaveBeenCalledWith({
      context: {
        routeType: 'planet',
        starId: 'tech',
        planetId: 'p_garden',
      },
      query: '总结当前星球内容',
    });
  });

  it('builds a hub fallback prompt when the user asks to summarize the current page from home', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    const resolveModel = vi.fn(() => createCloudflareModelContext(mockModel));

    generateTextMock.mockResolvedValue({
      text: '你当前位于首页，我先从整个花园结构开始介绍。',
    });

    const { createChatService } = await loadChatServiceModule();
    const loadContext = vi.fn().mockResolvedValue(fixtureLoadedHubContext);
    const service = createChatService({
      loadContext,
      resolveModel,
      searchKnowledge: searchKnowledgeMock,
    });

    await service.respond({ message: '总结当前页面' });

    expect(generateTextMock.mock.calls[0][0].system).toContain(
      '交互意图：content_understanding',
    );
    expect(generateTextMock.mock.calls[0][0].system).toContain('当前作用域：hub');
    expect(generateTextMock.mock.calls[0][0].system).toContain('当前位于首页');
  });

  it('skips semantic retrieval when the flag helper returns false', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    const resolveModel = vi.fn(() => createCloudflareModelContext(mockModel));

    generateTextMock.mockResolvedValue({
      text: '当前这个星球主要聚焦数字花园的构建记录和知识结构设计。',
    });

    const { createChatService } = await loadChatServiceModule();
    const loadContext = vi.fn().mockResolvedValue(fixtureLoadedPlanetContext);
    const service = createChatService({
      loadContext,
      resolveModel,
      searchKnowledge: searchKnowledgeMock,
      semanticRetrievalEnabled: () => false,
    });

    await service.respond({
      context: {
        routeType: 'planet',
        starId: 'tech',
        planetId: 'p_garden',
      },
      message: '总结当前星球内容',
    });

    expect(searchKnowledgeMock).not.toHaveBeenCalled();
  });

  it('uses semantic retrieval when explicitly enabled', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    const resolveModel = vi.fn(() => createCloudflareModelContext(mockModel));

    generateTextMock.mockResolvedValue({
      text: '当前这个星球主要记录数字花园的构建过程。',
    });
    searchKnowledgeMock.mockResolvedValue([]);

    const { createChatService } = await loadChatServiceModule();
    const loadContext = vi.fn().mockResolvedValue(fixtureLoadedPlanetContext);
    const service = createChatService({
      loadContext,
      resolveModel,
      searchKnowledge: searchKnowledgeMock,
      semanticRetrievalEnabled: () => true,
    });

    await service.respond({
      context: {
        routeType: 'planet',
        starId: 'tech',
        planetId: 'p_garden',
      },
      message: '总结当前星球内容',
    });

    expect(searchKnowledgeMock).toHaveBeenCalledWith({
      context: {
        routeType: 'planet',
        starId: 'tech',
        planetId: 'p_garden',
      },
      query: '总结当前星球内容',
    });
  });

  it('builds a hub overview prompt for whole-garden questions', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    const resolveModel = vi.fn(() => createCloudflareModelContext(mockModel));

    generateTextMock.mockResolvedValue({
      text: '这个花园目前主要有工程与架构、哲学思辨和 ACG 档案库三个板块。',
    });

    const { createChatService } = await loadChatServiceModule();
    const loadContext = vi.fn().mockResolvedValue(fixtureLoadedHubContext);
    const service = createChatService({
      loadContext,
      resolveModel,
      searchKnowledge: searchKnowledgeMock,
    });

    await service.respond({ message: '这个花园主要有哪些内容' });

    expect(generateTextMock.mock.calls[0][0].system).toContain(
      '交互意图：content_understanding',
    );
    expect(generateTextMock.mock.calls[0][0].system).toContain('当前作用域：hub');
    expect(generateTextMock.mock.calls[0][0].system).toContain('按主题概览整个花园');
    expect(generateTextMock.mock.calls[0][0].system).toContain('代表星球');
    expect(generateTextMock.mock.calls[0][0].system).toContain('最近更新');
  });

  it('builds an onboarding prompt for first-visit guidance', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    const resolveModel = vi.fn(() => createCloudflareModelContext(mockModel));

    generateTextMock.mockResolvedValue({
      text: '如果你是第一次来，可以先从数字花园日志开始，再去工程与架构和 ACG 档案库。',
    });

    const { createChatService } = await loadChatServiceModule();
    const loadContext = vi.fn().mockResolvedValue(fixtureLoadedHubContext);
    const service = createChatService({
      loadContext,
      resolveModel,
      searchKnowledge: searchKnowledgeMock,
    });

    await service.respond({ message: '我是第一次来，怎么逛比较合适' });

    expect(generateTextMock.mock.calls[0][0].system).toContain('交互意图：onboarding');
    expect(generateTextMock.mock.calls[0][0].system).toContain('当前作用域：hub');
    expect(generateTextMock.mock.calls[0][0].system).toContain('先介绍整个花园结构');
    expect(generateTextMock.mock.calls[0][0].system).toContain(
      '给出 2 到 4 条适合第一次进入的路线',
    );
    expect(generateTextMock.mock.calls[0][0].system).toContain('featuredPlanets');
  });

  it('returns a readable response when the provider config is missing', async () => {
    const { createChatService } = await loadChatServiceModule();
    const loadContext = vi.fn();
    const resolveModel = vi.fn(() => {
      throw new AIConfigError('AI_API_KEY is not configured for provider "google".');
    });
    const service = createChatService({
      loadContext,
      resolveModel,
      searchKnowledge: searchKnowledgeMock,
    });

    const result = await service.respond({ message: '介绍一下这个网站' });

    expect(result).toEqual({
      status: 503,
      response: {
        message:
          '[agent unavailable] AI_API_KEY is not configured for provider "google".',
        action: null,
      },
    });
    expect(loadContext).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(logAgentErrorMock).not.toHaveBeenCalled();
  });

  it('logs a config error with provider metadata when requestId is provided', async () => {
    const { createChatService } = await loadChatServiceModule();
    const service = createChatService({
      loadContext: vi.fn().mockResolvedValue(fixtureLoadedHubContext),
      resolveModel: vi.fn(() => {
        throw new AIConfigError(
          'AI_API_KEY is not configured for provider "cloudflare".',
        );
      }),
      searchKnowledge: searchKnowledgeMock,
    });

    await service.respond({
      message: '介绍一下这个网站',
      requestId: 'req-chat-config',
    });

    expect(logAgentErrorMock).toHaveBeenCalledWith(
      expect.any(AIConfigError),
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        provider: 'google',
        requestId: 'req-chat-config',
        status: 503,
      }),
    );
  });

  it('returns 500 and logs when loading structured context fails', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    const { createChatService } = await loadChatServiceModule();
    const service = createChatService({
      loadContext: vi.fn().mockRejectedValue(new Error('context failed')),
      resolveModel: vi.fn(() => createCloudflareModelContext(mockModel)),
      searchKnowledge: searchKnowledgeMock,
    });

    const result = await service.respond({
      context: {
        routeType: 'planet',
        starId: 'tech',
        planetId: 'p_garden',
      },
      message: '总结当前星球内容',
      requestId: 'req-chat-context',
    });

    expect(result).toEqual({
      status: 500,
      response: {
        message: '[agent unavailable] context failed',
        action: null,
      },
    });
    expect(logAgentErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'context failed',
        name: 'Error',
      }),
      expect.objectContaining({
        model: '@cf/meta/llama-4-scout-17b-16e-instruct',
        provider: 'cloudflare',
        requestId: 'req-chat-context',
        status: 500,
      }),
    );
  });

  it('returns 500 and logs when the upstream text generation fails', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    generateTextMock.mockRejectedValue(
      Object.assign(new Error('Bad Request'), { statusCode: 400 }),
    );

    const { createChatService } = await loadChatServiceModule();
    const service = createChatService({
      loadContext: vi.fn().mockResolvedValue(fixtureLoadedHubContext),
      resolveModel: vi.fn(() => createCloudflareModelContext(mockModel)),
      searchKnowledge: searchKnowledgeMock,
    });

    const result = await service.respond({
      message: '介绍一下这个网站',
      requestId: 'req-chat-upstream',
    });

    expect(result).toEqual({
      status: 500,
      response: {
        message: '[agent unavailable] Bad Request',
        action: null,
      },
    });
    expect(logAgentErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Bad Request',
        name: 'Error',
        statusCode: 400,
      }),
      expect.objectContaining({
        model: '@cf/meta/llama-4-scout-17b-16e-instruct',
        provider: 'cloudflare',
        requestId: 'req-chat-upstream',
        status: 500,
      }),
    );
  });

  it('continues without failing when semantic retrieval is unavailable', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    const resolveModel = vi.fn(() => createCloudflareModelContext(mockModel));

    searchKnowledgeMock.mockRejectedValue(new Error('search failed'));
    generateTextMock.mockResolvedValue({
      text: '当前这个星球主要记录数字花园构建过程。',
    });

    const { createChatService } = await loadChatServiceModule();
    const loadContext = vi.fn().mockResolvedValue(fixtureLoadedPlanetContext);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const service = createChatService({
      loadContext,
      resolveModel,
      semanticRetrievalEnabled: () => true,
      searchKnowledge: searchKnowledgeMock,
    });

    const result = await service.respond({
      context: {
        routeType: 'planet',
        starId: 'tech',
        planetId: 'p_garden',
      },
      message: '总结当前星球内容',
    });

    expect(result.status).toBe(200);
    expect(generateTextMock.mock.calls[0][0].system).not.toContain('语义检索补充：');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[semantic retrieval unavailable]',
      'search failed',
    );
    consoleErrorSpy.mockRestore();
  });
});
