import { describe, expect, it } from 'vitest';
import {
  resolveInteractionIntent,
  type InteractionIntent,
} from '../../src/lib/agent/content-intent';

function expectIntent(message: string, expected: InteractionIntent) {
  expect(resolveInteractionIntent(message)).toBe(expected);
}

describe('resolveInteractionIntent', () => {
  it('detects navigation intents before other content categories', () => {
    expectIntent('带我去数字花园日志', 'navigation');
  });

  it('detects onboarding language', () => {
    expectIntent('我是第一次来，怎么逛比较合适', 'onboarding');
    expectIntent('先带我逛一下这个花园', 'onboarding');
  });

  it('detects content understanding questions across scopes', () => {
    expectIntent('总结当前页面', 'content_understanding');
    expectIntent('这个花园主要有哪些内容', 'content_understanding');
    expectIntent('这里主要讲什么', 'content_understanding');
  });

  it('detects recommendation language', () => {
    expectIntent('推荐一篇类似的文章', 'recommendation');
    expectIntent('你可能还想看什么', 'recommendation');
  });

  it('detects discovery language', () => {
    expectIntent('最近更新的几个星球', 'discovery');
    expectIntent('这条内容线的关键节点和关系是什么', 'discovery');
  });

  it('falls back to general chat when the message is open-ended', () => {
    expectIntent('介绍一下你自己', 'general_chat');
  });
});
