import { isNavigationIntent } from './navigation-resolver';

export type InteractionIntent =
  | 'navigation'
  | 'recommendation'
  | 'discovery'
  | 'content_understanding'
  | 'onboarding'
  | 'general_chat';

const ONBOARDING_PATTERNS = [
  /第一次来/u,
  /第一次逛/u,
  /怎么逛/u,
  /导览/u,
  /先带我逛/u,
  /从哪里开始/u,
  /怎么开始/u,
  /怎么探索/u,
];

const RECOMMENDATION_PATTERNS = [
  /推荐/u,
  /相关文章/u,
  /相关星球/u,
  /还想看/u,
  /延伸/u,
  /接下来(?:看|读)什么/u,
  /先看什么/u,
  /看什么/u,
  /读什么/u,
  /什么值得看/u,
  /类似内容/u,
];

const DISCOVERY_PATTERNS = [
  /最近更新/u,
  /最新更新/u,
  /最近新增/u,
  /新增内容/u,
  /最新内容/u,
  /关键节点/u,
  /内容脉络/u,
  /什么关系/u,
  /有哪些关系/u,
  /主干是什么/u,
];

const CONTENT_UNDERSTANDING_PATTERNS = [
  /总结/u,
  /概括/u,
  /这里主要讲什么/u,
  /这一页在讲什么/u,
  /当前页面/u,
  /当前文章/u,
  /当前星球/u,
  /这个星球主要讲什么/u,
  /主要有哪些内容/u,
  /花园总览/u,
  /这个花园主要(?:在|写)?什么/u,
  /全站主要(?:在|写)?什么/u,
];

export function resolveInteractionIntent(message: string): InteractionIntent {
  const normalizedMessage = message.trim();

  if (isNavigationIntent(normalizedMessage)) {
    return 'navigation';
  }

  if (ONBOARDING_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return 'onboarding';
  }

  if (
    RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(normalizedMessage))
  ) {
    return 'recommendation';
  }

  if (DISCOVERY_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return 'discovery';
  }

  if (
    CONTENT_UNDERSTANDING_PATTERNS.some((pattern) =>
      pattern.test(normalizedMessage),
    )
  ) {
    return 'content_understanding';
  }

  return 'general_chat';
}
