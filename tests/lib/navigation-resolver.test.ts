import { describe, expect, it } from 'vitest';
import { fixtureHydratedGalaxy } from '../fixtures/galaxy-fixtures';
import {
  extractNavigationTargetQuery,
  isNavigationIntent,
  resolveNavigationRequest,
} from '../../src/lib/agent/navigation-resolver';

describe('navigation-resolver', () => {
  it('identifies navigation intent for explicit navigation phrases', () => {
    expect(isNavigationIntent('带我去数字花园日志')).toBe(true);
    expect(isNavigationIntent('去花园')).toBe(true);
    expect(isNavigationIntent('打开数字花园日志')).toBe(true);
    expect(isNavigationIntent('介绍一下这个网站')).toBe(false);
  });

  it('extracts the navigation target query from the raw message', () => {
    expect(extractNavigationTargetQuery('带我去数字花园日志')).toBe(
      '数字花园日志',
    );
    expect(extractNavigationTargetQuery('去 acg 看看')).toBe('acg');
    expect(extractNavigationTargetQuery('打开关于我')).toBe('关于我');
  });

  it('resolves a known target to a TELEPORT action', () => {
    expect(
      resolveNavigationRequest(fixtureHydratedGalaxy, '带我去工程与架构'),
    ).toEqual({
      kind: 'resolved',
      message: '跃迁坐标已锁定，准备执行传送。',
      targetQuery: '工程与架构',
      action: {
        type: 'TELEPORT',
        targetId: 'tech',
        targetType: 'star',
      },
    });
  });

  it('resolves short aliases like 去日志 to the garden planet', () => {
    expect(resolveNavigationRequest(fixtureHydratedGalaxy, '去日志')).toEqual({
      kind: 'resolved',
      message: '跃迁坐标已锁定，准备执行传送。',
      targetQuery: '日志',
      action: {
        type: 'TELEPORT',
        targetId: 'p_garden',
        targetType: 'planet',
      },
    });
  });

  it('returns not_found when the request is navigation but the target does not exist', () => {
    expect(
      resolveNavigationRequest(fixtureHydratedGalaxy, '带我去量子深海'),
    ).toEqual({
      kind: 'not_found',
      message: '无法在当前星图中定位该目标，我可以带你前往工程、哲学或 ACG 领域。',
      targetQuery: '量子深海',
      action: null,
    });
  });

  it('returns not_navigation for ordinary chat requests', () => {
    expect(
      resolveNavigationRequest(fixtureHydratedGalaxy, '请简单介绍这个数字花园'),
    ).toEqual({
      kind: 'not_navigation',
    });
  });
});
