import { describe, expect, it } from 'vitest';
import { chunkMarkdownDocument } from '../../src/lib/content-sync/chunk-markdown';

const longMarkdown = [
  '# 为什么我选择 3D 星系',
  '',
  '我希望把知识组织成一个有层级、有距离感、也有探索路径的空间，而不是时间线列表。',
  '',
  '## 它先是信息架构问题',
  '',
  '当内容同时覆盖工程、哲学和 ACG 时，传统分类很难保留跨主题的牵引关系。'.repeat(20),
  '',
  '## 它也会变成交互问题',
  '',
  '如果首页只是一个入口页，用户会快速失去对整体结构的直觉。'.repeat(20),
].join('\n');

describe('chunkMarkdownDocument', () => {
  it('chunks markdown into ordered retrieval passages', () => {
    const chunks = chunkMarkdownDocument(longMarkdown, { maxChars: 900 });

    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      content: expect.stringContaining('为什么我选择 3D 星系'),
    });
    expect(chunks.length).toBeGreaterThan(1);
  });
});
