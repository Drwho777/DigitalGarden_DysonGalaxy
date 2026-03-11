import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import matter from 'gray-matter';
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

function splitFrontmatter(rawDocument: string) {
  const normalizedDocument = rawDocument.replace(/^\uFEFF/gu, '');
  if (!normalizedDocument.trimStart().startsWith('---')) {
    throw new Error('Markdown source file is missing frontmatter.');
  }

  const parsedDocument = matter(normalizedDocument);

  return {
    body: parsedDocument.content,
    frontmatter: parsedDocument.data as Record<string, unknown>,
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

function readPublishedAtField(
  frontmatter: Record<string, unknown>,
  filePath: string,
) {
  const value = frontmatter.publishedAt;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Missing required frontmatter field "publishedAt" in ${filePath}.`,
    );
  }

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
    publishedAt: readPublishedAtField(frontmatter, filePath),
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
