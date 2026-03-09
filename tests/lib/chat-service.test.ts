import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIConfigError } from '../../src/lib/ai/config';
import { fixtureHydratedGalaxy } from '../fixtures/galaxy-fixtures';

const generateTextMock = vi.fn();
const logAgentErrorMock = vi.fn();

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
  });

  it('returns 422 for empty messages without loading galaxy or resolving a model', async () => {
    const { createChatService } = await loadChatServiceModule();
    const loadGalaxy = vi.fn();
    const resolveModel = vi.fn();
    const service = createChatService({ loadGalaxy, resolveModel });

    const result = await service.respond({ message: '   ' });

    expect(result).toEqual({
      status: 422,
      response: {
        message: '`message` is required.',
        action: null,
      },
    });
    expect(loadGalaxy).not.toHaveBeenCalled();
    expect(resolveModel).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('generates text without navigation tools or loop control', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    const resolveModel = vi.fn(() => createCloudflareModelContext(mockModel));

    generateTextMock.mockResolvedValue({
      text: '这是一个关于 3D 数字花园的实验网站。',
    });

    const { createChatService } = await loadChatServiceModule();
    const loadGalaxy = vi.fn().mockResolvedValue(fixtureHydratedGalaxy);
    const service = createChatService({ loadGalaxy, resolveModel });

    const result = await service.respond({ message: '介绍一下这个网站' });

    expect(resolveModel).toHaveBeenCalledTimes(1);
    expect(loadGalaxy).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock.mock.calls[0][0]).toMatchObject({
      model: mockModel,
      prompt: '介绍一下这个网站',
    });
    expect(generateTextMock.mock.calls[0][0].toolChoice).toBeUndefined();
    expect(generateTextMock.mock.calls[0][0].tools).toBeUndefined();
    expect(generateTextMock.mock.calls[0][0].stopWhen).toBeUndefined();
    expect(generateTextMock.mock.calls[0][0].system).toContain('你当前只负责解释、总结、推荐与介绍');
    expect(result).toEqual({
      status: 200,
      response: {
        message: '这是一个关于 3D 数字花园的实验网站。',
        action: null,
      },
    });
    expect(logAgentErrorMock).not.toHaveBeenCalled();
  });

  it('returns a readable response when the provider config is missing', async () => {
    const { createChatService } = await loadChatServiceModule();
    const loadGalaxy = vi.fn();
    const resolveModel = vi.fn(() => {
      throw new AIConfigError('AI_API_KEY is not configured for provider "google".');
    });
    const service = createChatService({ loadGalaxy, resolveModel });

    const result = await service.respond({ message: '介绍一下这个网站' });

    expect(result).toEqual({
      status: 503,
      response: {
        message:
          '[agent unavailable] AI_API_KEY is not configured for provider "google".',
        action: null,
      },
    });
    expect(loadGalaxy).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(logAgentErrorMock).not.toHaveBeenCalled();
  });

  it('logs a config error with provider metadata when requestId is provided', async () => {
    const { createChatService } = await loadChatServiceModule();
    const service = createChatService({
      resolveModel: vi.fn(() => {
        throw new AIConfigError(
          'AI_API_KEY is not configured for provider "cloudflare".',
        );
      }),
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

  it('returns 500 and logs when the upstream text generation fails', async () => {
    const mockModel = { id: 'mock-model:chat' } as any;
    generateTextMock.mockRejectedValue(
      Object.assign(new Error('Bad Request'), { statusCode: 400 }),
    );

    const { createChatService } = await loadChatServiceModule();
    const service = createChatService({
      loadGalaxy: vi.fn().mockResolvedValue(fixtureHydratedGalaxy),
      resolveModel: vi.fn(() => createCloudflareModelContext(mockModel)),
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
});
