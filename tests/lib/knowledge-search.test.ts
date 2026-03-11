import { beforeEach, describe, expect, it, vi } from 'vitest';

const embedQueryMock = vi.fn();
const embedDocumentMock = vi.fn();
const rpcMock = vi.fn();
const createServerSupabaseClientMock = vi.fn(() => ({
  rpc: rpcMock,
}));

vi.mock('../../src/lib/ai/embedding', () => ({
  embedDocument: embedDocumentMock,
  embedQuery: embedQueryMock,
}));

vi.mock('../../src/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

async function loadKnowledgeSearchModule() {
  vi.resetModules();
  return import('../../src/lib/agent/knowledge-search');
}

describe('searchKnowledge', () => {
  beforeEach(() => {
    vi.resetModules();
    embedDocumentMock.mockReset();
    embedQueryMock.mockReset();
    rpcMock.mockReset();
    createServerSupabaseClientMock.mockClear();
    embedQueryMock.mockResolvedValue([0.1, 0.2, 0.3]);
    rpcMock.mockResolvedValue({
      data: [
        {
          chunk_index: 0,
          content_chunk: '数字花园日志主要记录 3D 星系知识结构的构建过程。',
          node_id: 'node-1',
          similarity: 0.92,
        },
      ],
      error: null,
    });
  });

  it('scopes vector retrieval to the hub when no context is provided', async () => {
    const { searchKnowledge } = await loadKnowledgeSearchModule();

    const matches = await searchKnowledge({
      query: '这个花园主要有哪些内容',
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'match_node_embeddings',
      expect.objectContaining({
        filter_planet_id: null,
        filter_star_id: null,
      }),
    );
    expect(embedDocumentMock).not.toHaveBeenCalled();
    expect(matches.length).toBeGreaterThan(0);
  });

  it('scopes vector retrieval to the current planet when context is planet-level', async () => {
    const { searchKnowledge } = await loadKnowledgeSearchModule();

    const matches = await searchKnowledge({
      query: '这个星球主要在讲什么',
      context: { routeType: 'planet', starId: 'tech', planetId: 'p_garden' },
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'match_node_embeddings',
      expect.objectContaining({
        filter_planet_id: 'p_garden',
        filter_star_id: 'tech',
      }),
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('keeps node requests scoped to the current star and planet filters', async () => {
    const { searchKnowledge } = await loadKnowledgeSearchModule();

    await searchKnowledge({
      query: '当前页面主要讲什么',
      context: {
        routeType: 'node',
        starId: 'tech',
        planetId: 'p_garden',
        slug: 'why-3d-galaxy',
      },
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'match_node_embeddings',
      expect.objectContaining({
        filter_planet_id: 'p_garden',
        filter_star_id: 'tech',
      }),
    );
  });
});
