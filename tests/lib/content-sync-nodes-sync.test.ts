import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceNode } from '../../src/lib/content-sync/markdown-source';

const upsertMock = vi.fn();
const fromMock = vi.fn(() => ({
  upsert: upsertMock,
}));

async function loadNodesSyncModule() {
  vi.resetModules();
  return import('../../src/lib/content-sync/nodes-sync');
}

describe('syncNodesToSupabase', () => {
  beforeEach(() => {
    vi.resetModules();
    fromMock.mockClear();
    upsertMock.mockReset();
    upsertMock.mockResolvedValue({ error: null });
  });

  it('upserts nodes with content_hash and markdown payload', async () => {
    const { syncNodesToSupabase } = await loadNodesSyncModule();
    const sourceNodes: SourceNode[] = [
      {
        body: '# Title\n\nBody',
        contentHash:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        filePath: 'src/content/nodes/tech/p_garden/why-3d-galaxy.md',
        heroImage: '/images/hero-garden.svg',
        planetId: 'p_garden',
        publishedAt: '2026-03-06',
        slug: 'why-3d-galaxy',
        starId: 'tech',
        summary: 'Build a galaxy-shaped knowledge garden.',
        tags: ['Astro', 'Three.js'],
        title: 'Why 3D Galaxy',
      },
    ];

    await syncNodesToSupabase({
      sourceNodes,
      supabase: {
        from: fromMock,
      },
    });

    expect(fromMock).toHaveBeenCalledWith('nodes');
    expect(upsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          content_raw: '# Title\n\nBody',
          planet_id: 'p_garden',
          slug: 'why-3d-galaxy',
          star_id: 'tech',
        }),
      ]),
      { onConflict: 'star_id,planet_id,slug' },
    );
  });
});
