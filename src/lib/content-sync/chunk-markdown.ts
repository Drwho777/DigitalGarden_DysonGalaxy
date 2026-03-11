import { normalizeMarkdownBody } from './hash.ts';

export interface MarkdownChunk {
  chunkIndex: number;
  content: string;
}

function splitIntoSections(markdown: string) {
  const normalizedMarkdown = normalizeMarkdownBody(markdown);
  if (!normalizedMarkdown) {
    return [];
  }

  const lines = normalizedMarkdown.split('\n');
  const sections: string[] = [];
  let currentSection: string[] = [];

  for (const line of lines) {
    if (/^#{1,6}\s+/u.test(line) && currentSection.length > 0) {
      sections.push(normalizeMarkdownBody(currentSection.join('\n')));
      currentSection = [line];
      continue;
    }

    currentSection.push(line);
  }

  if (currentSection.length > 0) {
    sections.push(normalizeMarkdownBody(currentSection.join('\n')));
  }

  return sections.filter(Boolean);
}

function splitOversizedParagraph(paragraph: string, maxChars: number) {
  const sentences =
    paragraph.match(/[^。！？!?\.]+[。！？!?\.]?/gu)?.map((part) => part.trim()) ??
    [paragraph];
  const chunks: string[] = [];
  let buffer = '';

  const flushBuffer = () => {
    if (buffer) {
      chunks.push(buffer);
      buffer = '';
    }
  };

  for (const sentence of sentences) {
    if (!sentence) {
      continue;
    }

    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      buffer = candidate;
      continue;
    }

    flushBuffer();

    if (sentence.length <= maxChars) {
      buffer = sentence;
      continue;
    }

    for (let index = 0; index < sentence.length; index += maxChars) {
      chunks.push(sentence.slice(index, index + maxChars));
    }
  }

  flushBuffer();
  return chunks;
}

function splitSectionIntoChunks(section: string, maxChars: number) {
  if (section.length <= maxChars) {
    return [section];
  }

  const paragraphs = section
    .split(/\n{2,}/u)
    .map((paragraph) => normalizeMarkdownBody(paragraph))
    .filter(Boolean);
  const chunks: string[] = [];
  let buffer = '';

  const flushBuffer = () => {
    if (buffer) {
      chunks.push(buffer);
      buffer = '';
    }
  };

  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      buffer = candidate;
      continue;
    }

    flushBuffer();

    if (paragraph.length <= maxChars) {
      buffer = paragraph;
      continue;
    }

    chunks.push(...splitOversizedParagraph(paragraph, maxChars));
  }

  flushBuffer();
  return chunks;
}

export function chunkMarkdownDocument(
  markdown: string,
  options: { maxChars?: number } = {},
): MarkdownChunk[] {
  const maxChars = options.maxChars ?? 900;
  if (maxChars <= 0) {
    throw new Error('maxChars must be greater than 0.');
  }

  return splitIntoSections(markdown)
    .flatMap((section) => splitSectionIntoChunks(section, maxChars))
    .map((content, chunkIndex) => ({
      chunkIndex,
      content,
    }));
}
