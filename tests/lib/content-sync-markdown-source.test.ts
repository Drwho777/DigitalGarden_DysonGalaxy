import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { loadMarkdownSourceNodes } from '../../src/lib/content-sync/markdown-source';

const tempDirs: string[] = [];

describe('loadMarkdownSourceNodes', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
    );
  });

  it('loads nested markdown nodes with normalized metadata and content hashes', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'garden-sync-'));
    tempDirs.push(rootDir);

    const nestedDirectory = join(rootDir, 'tech', 'p_garden');
    await mkdir(nestedDirectory, { recursive: true });
    await writeFile(
      join(nestedDirectory, 'why-3d-galaxy.md'),
      [
        '---',
        'title: Why 3D Galaxy',
        'slug: why-3d-galaxy',
        'starId: tech',
        'planetId: p_garden',
        'summary: >',
        '  Build a galaxy-shaped',
        '  knowledge garden.',
        'tags: [Three.js, Astro]',
        'publishedAt: 2026-03-06',
        'heroImage: /images/hero-garden.svg',
        '---',
        '',
        '# Why',
        '',
        'Body',
      ].join('\n'),
      'utf8',
    );

    const nodes = await loadMarkdownSourceNodes(rootDir);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      body: '# Why\n\nBody',
      planetId: 'p_garden',
      publishedAt: '2026-03-06',
      slug: 'why-3d-galaxy',
      starId: 'tech',
      tags: ['Three.js', 'Astro'],
      title: 'Why 3D Galaxy',
    });
    expect(nodes[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
