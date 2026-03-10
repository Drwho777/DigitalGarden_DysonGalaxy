import { isNavigationIntent } from './navigation-resolver';

export type InteractionIntent =
  | 'navigation'
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
  /这个花园主要(?:有|写)什么/u,
  /全站主要(?:有|写)什么/u,
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
    CONTENT_UNDERSTANDING_PATTERNS.some((pattern) =>
      pattern.test(normalizedMessage),
    )
  ) {
    return 'content_understanding';
  }

  return 'general_chat';
}
