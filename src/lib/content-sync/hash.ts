import { createHash } from 'node:crypto';

export const HASH_FIELDS = [
  'title',
  'starId',
  'planetId',
  'summary',
  'tags',
  'publishedAt',
  'heroImage',
] as const;

type HashField = (typeof HASH_FIELDS)[number];

function normalizeDateValue(value: Date | string) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const trimmedValue = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmedValue)) {
    return trimmedValue;
  }

  return new Date(trimmedValue).toISOString().slice(0, 10);
}

function normalizeHashFieldValue(field: HashField, value: unknown) {
  if (value == null) {
    return undefined;
  }

  if (field === 'tags') {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }

  if (field === 'publishedAt') {
    if (value instanceof Date || typeof value === 'string') {
      return normalizeDateValue(value);
    }

    return undefined;
  }

  return String(value).trim();
}

function trimOuterBlankLines(lines: string[]) {
  let startIndex = 0;
  let endIndex = lines.length;

  while (startIndex < endIndex && lines[startIndex]?.trim() === '') {
    startIndex += 1;
  }

  while (endIndex > startIndex && lines[endIndex - 1]?.trim() === '') {
    endIndex -= 1;
  }

  return lines.slice(startIndex, endIndex);
}

export function normalizeMarkdownBody(body: string) {
  const normalizedLines = body.replace(/\r\n?/gu, '\n').split('\n');
  return trimOuterBlankLines(normalizedLines).join('\n');
}

export function createContentHash(input: {
  body: string;
  frontmatter: Record<string, unknown>;
}) {
  const canonicalFrontmatter = Object.fromEntries(
    [...HASH_FIELDS]
      .sort((left, right) => left.localeCompare(right))
      .flatMap((field) => {
        const normalizedValue = normalizeHashFieldValue(
          field,
          input.frontmatter[field],
        );

        return normalizedValue === undefined ? [] : [[field, normalizedValue]];
      }),
  );

  return createHash('sha256')
    .update(
      JSON.stringify({
        body: normalizeMarkdownBody(input.body),
        frontmatter: canonicalFrontmatter,
      }),
    )
    .digest('hex');
}
