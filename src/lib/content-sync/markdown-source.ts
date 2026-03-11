import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { createContentHash, normalizeMarkdownBody } from './hash.ts';

export interface SourceNode {
  body: string;
  contentHash: string;
  filePath: string;
  heroImage: string;
  planetId: string;
  publishedAt: string;
  slug: string;
  starId: string;
  summary: string;
  tags: string[];
  title: string;
}

function parseScalarValue(value: string) {
  const trimmedValue = value.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
}

function parseFrontmatterBlock(block: string) {
  const frontmatter: Record<string, unknown> = {};
  const lines = block.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.trim() === '') {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/u);
    if (!match) {
      throw new Error(`Unsupported frontmatter line: "${line}"`);
    }

    const [, key, inlineValue] = match;
    if (inlineValue.trim() !== '') {
      frontmatter[key] = parseScalarValue(inlineValue);
      continue;
    }

    const items: string[] = [];
    while (index + 1 < lines.length) {
      const nextLine = lines[index + 1] ?? '';
      const itemMatch = nextLine.match(/^\s*-\s+(.*)$/u);
      if (!itemMatch) {
        break;
      }

      items.push(parseScalarValue(itemMatch[1] ?? ''));
      index += 1;
    }

    frontmatter[key] = items;
  }

  return frontmatter;
}

function splitFrontmatter(rawDocument: string) {
  const normalizedDocument = rawDocument.replace(/^\uFEFF/gu, '').replace(/\r\n?/gu, '\n');
  if (!normalizedDocument.startsWith('---\n')) {
    throw new Error('Markdown source file is missing frontmatter.');
  }

  const frontmatterBoundary = normalizedDocument.indexOf('\n---\n', 4);
  if (frontmatterBoundary === -1) {
    throw new Error('Markdown source file frontmatter is not closed.');
  }

  return {
    body: normalizedDocument.slice(frontmatterBoundary + 5),
    frontmatter: parseFrontmatterBlock(
      normalizedDocument.slice(4, frontmatterBoundary),
    ),
  };
}

function requireStringField(
  frontmatter: Record<string, unknown>,
  field: keyof SourceNode | 'slug',
  filePath: string,
) {
  const value = frontmatter[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required frontmatter field "${field}" in ${filePath}.`);
  }

  return value.trim();
}

function readTagsField(frontmatter: Record<string, unknown>) {
  const tags = frontmatter.tags;
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags.map((tag) => String(tag).trim()).filter(Boolean);
}

function normalizePublishedAt(value: string) {
  const trimmedValue = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmedValue)) {
    return trimmedValue;
  }

  return new Date(trimmedValue).toISOString().slice(0, 10);
}

async function collectMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedPaths = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const entryPath = resolve(directory, entry.name);
        if (entry.isDirectory()) {
          return collectMarkdownFiles(entryPath);
        }

        const extension = extname(entry.name).toLowerCase();
        if (extension === '.md' || extension === '.mdx') {
          return [entryPath];
        }

        return [];
      }),
  );

  return nestedPaths.flat();
}

async function loadSourceNode(filePath: string): Promise<SourceNode> {
  const rawDocument = await readFile(filePath, 'utf8');
  const { body, frontmatter } = splitFrontmatter(rawDocument);
  const normalizedBody = normalizeMarkdownBody(body);
  const slug =
    (typeof frontmatter.slug === 'string' && frontmatter.slug.trim()) ||
    basename(filePath, extname(filePath));

  const sourceNode: SourceNode = {
    body: normalizedBody,
    contentHash: '',
    filePath,
    heroImage: requireStringField(frontmatter, 'heroImage', filePath),
    planetId: requireStringField(frontmatter, 'planetId', filePath),
    publishedAt: normalizePublishedAt(
      requireStringField(frontmatter, 'publishedAt', filePath),
    ),
    slug,
    starId: requireStringField(frontmatter, 'starId', filePath),
    summary: requireStringField(frontmatter, 'summary', filePath),
    tags: readTagsField(frontmatter),
    title: requireStringField(frontmatter, 'title', filePath),
  };

  sourceNode.contentHash = createContentHash({
    body: sourceNode.body,
    frontmatter: {
      heroImage: sourceNode.heroImage,
      planetId: sourceNode.planetId,
      publishedAt: sourceNode.publishedAt,
      starId: sourceNode.starId,
      summary: sourceNode.summary,
      tags: sourceNode.tags,
      title: sourceNode.title,
    },
  });

  return sourceNode;
}

export async function loadMarkdownSourceNodes(rootDir = 'src/content/nodes') {
  const filePaths = await collectMarkdownFiles(resolve(rootDir));
  const sourceNodes = await Promise.all(filePaths.map(loadSourceNode));

  return sourceNodes.sort((left, right) => left.filePath.localeCompare(right.filePath));
}
