import { beforeEach, describe, expect, it, vi } from 'vitest';

const embedMock = vi.fn();
const googleEmbeddingModelMock = vi.fn();
const createGoogleGenerativeAIMock = vi.fn(() => ({
  embeddingModel: googleEmbeddingModelMock,
}));
const openAICompatibleEmbeddingModelMock = vi.fn();
const createOpenAICompatibleMock = vi.fn(() => ({
  embeddingModel: openAICompatibleEmbeddingModelMock,
}));

vi.mock('ai', () => ({
  embed: embedMock,
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: createGoogleGenerativeAIMock,
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: createOpenAICompatibleMock,
}));

async function loadEmbeddingModule() {
  vi.resetModules();
  return import('../../src/lib/ai/embedding');
}

describe('embedding helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    embedMock.mockReset();
    googleEmbeddingModelMock.mockReset();
    createGoogleGenerativeAIMock.mockClear();
    openAICompatibleEmbeddingModelMock.mockReset();
    createOpenAICompatibleMock.mockClear();
    googleEmbeddingModelMock.mockReturnValue({ kind: 'google-embedding-model' });
    openAICompatibleEmbeddingModelMock.mockReturnValue({
      kind: 'cloudflare-embedding-model',
    });
  });

  it('requests google embeddings with the configured vector dimensions even when embedding provider is decoupled from chat provider', async () => {
    process.env.AI_PROVIDER = 'cloudflare';
    process.env.EMBEDDING_PROVIDER = 'google';
    process.env.AI_API_KEY = 'google-key';
    process.env.EMBEDDING_MODEL = 'gemini-embedding-001';
    process.env.EMBEDDING_DIMENSIONS = '1024';
    embedMock.mockResolvedValue({
      embedding: Array.from({ length: 1024 }, () => 0.01),
    });

    const { embedQuery } = await loadEmbeddingModule();
    const embedding = await embedQuery('garden overview');

    expect(embedding).toHaveLength(1024);
    expect(createGoogleGenerativeAIMock).toHaveBeenCalledWith({
      apiKey: 'google-key',
    });
    expect(googleEmbeddingModelMock).toHaveBeenCalledWith(
      'gemini-embedding-001',
    );
    expect(embedMock).toHaveBeenCalledWith({
      model: { kind: 'google-embedding-model' },
      providerOptions: {
        google: {
          outputDimensionality: 1024,
          taskType: 'RETRIEVAL_QUERY',
        },
      },
      value: 'garden overview',
    });
  });

  it('fails fast when a cloudflare embedding model does not match the database vector dimensions', async () => {
    process.env.AI_PROVIDER = 'google';
    process.env.EMBEDDING_PROVIDER = 'cloudflare';
    process.env.AI_API_KEY = 'cloudflare-key';
    process.env.AI_ACCOUNT_ID = 'account-123';
    process.env.EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
    process.env.EMBEDDING_DIMENSIONS = '1024';
    embedMock.mockResolvedValue({
      embedding: Array.from({ length: 1536 }, () => 0.01),
    });

    const { embedQuery } = await loadEmbeddingModule();

    await expect(embedQuery('garden overview')).rejects.toThrow(
      'produced 1536 dimensions, but the database expects 1024',
    );
    expect(createOpenAICompatibleMock).toHaveBeenCalledWith({
      apiKey: 'cloudflare-key',
      baseURL: 'https://api.cloudflare.com/client/v4/accounts/account-123/ai/v1',
      name: 'cloudflare',
    });
    expect(openAICompatibleEmbeddingModelMock).toHaveBeenCalledWith(
      '@cf/baai/bge-base-en-v1.5',
    );
    expect(embedMock).toHaveBeenCalledWith({
      model: { kind: 'cloudflare-embedding-model' },
      providerOptions: undefined,
      value: 'garden overview',
    });
  });

  it('creates retrieval-document embeddings for content indexing', async () => {
    process.env.AI_PROVIDER = 'cloudflare';
    process.env.EMBEDDING_PROVIDER = 'google';
    process.env.AI_API_KEY = 'google-key';
    process.env.EMBEDDING_MODEL = 'gemini-embedding-001';
    process.env.EMBEDDING_DIMENSIONS = '1024';
    embedMock.mockResolvedValue({
      embedding: Array.from({ length: 1024 }, () => 0.01),
    });

    const { embedDocument } = await loadEmbeddingModule();
    const embedding = await embedDocument('section text');

    expect(embedding).toHaveLength(1024);
    expect(embedMock).toHaveBeenCalledWith({
      model: { kind: 'google-embedding-model' },
      providerOptions: {
        google: {
          outputDimensionality: 1024,
          taskType: 'RETRIEVAL_DOCUMENT',
        },
      },
      value: 'section text',
    });
  });
});
