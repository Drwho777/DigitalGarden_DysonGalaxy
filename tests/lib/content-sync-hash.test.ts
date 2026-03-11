import { describe, expect, it } from 'vitest';
import { createContentHash } from '../../src/lib/content-sync/hash';

describe('createContentHash', () => {
  it('creates a stable content hash from canonicalized frontmatter plus markdown body', () => {
    const left = createContentHash({
      body: '# Title\r\n\r\nBody\r\n',
      frontmatter: {
        starId: 'tech',
        planetId: 'p_garden',
        title: 'Title',
        tags: ['B', 'A'],
      },
    });

    const right = createContentHash({
      body: '# Title\n\nBody',
      frontmatter: {
        title: 'Title',
        planetId: 'p_garden',
        starId: 'tech',
        tags: ['A', 'B'],
        updatedAt: 'ignore-me',
      } as Record<string, unknown>,
    });

    expect(left).toBe(right);
  });
});
