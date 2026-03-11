import { beforeEach, describe, expect, it, vi } from 'vitest';

const readEmbeddingConfigMock = vi.fn(() => ({
  model: 'gemini-embedding-001',
  provider: 'google',
}));
const embedDocumentMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('../../src/lib/ai/embedding', () => ({
  readEmbeddingConfig: readEmbeddingConfigMock,
}));

async function loadEmbeddingsSyncModule() {
  vi.resetModules();
  return import('../../src/lib/content-sync/embeddings-sync');
}

describe('syncNodeEmbeddings', () => {
  beforeEach(() => {
    vi.resetModules();
    readEmbeddingConfigMock.mockClear();
    embedDocumentMock.mockReset();
    rpcMock.mockReset();
    embedDocumentMock.mockResolvedValue([0.1, 0.2, 0.3]);
    rpcMock.mockResolvedValue({ error: null });
  });

  it('replaces node embeddings through a single rpc after all chunk embeddings are ready', async () => {
    const { syncNodeEmbeddings } = await loadEmbeddingsSyncModule();

    await syncNodeEmbeddings({
      changedNodes: [
        { id: 'node-1', contentHash: 'hash-1', contentRaw: '# Title\n\nBody' },
      ],
      embedDocument: embedDocumentMock,
      supabase: {
        rpc: rpcMock,
      },
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'replace_node_embeddings_for_node',
      expect.objectContaining({
        expected_content_hash: 'hash-1',
        target_node_id: 'node-1',
      }),
    );
  });

  it('does not replace existing rows if embedding generation fails before the rpc swap', async () => {
    const { syncNodeEmbeddings } = await loadEmbeddingsSyncModule();

    embedDocumentMock.mockRejectedValueOnce(new Error('rate limited'));

    await expect(
      syncNodeEmbeddings({
        changedNodes: [
          { id: 'node-1', contentHash: 'hash-1', contentRaw: '# Title\n\nBody' },
        ],
        embedDocument: embedDocumentMock,
        supabase: {
          rpc: rpcMock,
        },
      }),
    ).rejects.toThrow('rate limited');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
