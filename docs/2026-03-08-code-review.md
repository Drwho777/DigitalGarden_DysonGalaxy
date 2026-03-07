# 2026-03-08 代码 Review

## Findings

### P1: `innerHTML` 拼接存在潜在 XSS 风险（建议优先处理）
- 位置：`src/lib/browser/galaxy-scene-panel.ts`
- 现状：`renderStar` 与 `renderPlanet` 直接使用模板字符串拼接 HTML 并写入 `innerHTML`。
- 风险：当前数据源主要来自本地 seed/content，短期可控；但若后续接入 CMS、外部 API 或用户可编辑内容，`name`/`description`/`article.title`/`article.summary` 会形成注入面。
- 建议：
  - 方案 A：对所有动态文本统一做 `escapeHtml`。
  - 方案 B：改为 DOM API + `textContent` 构建节点，避免拼接 HTML。

### P2: 动画帧内对象分配导致额外 GC 压力
- 位置：`src/lib/browser/galaxy-scene.ts`
- 现状：`animate` 循环内每帧创建 `new THREE.Vector3()`。
- 风险：高频分配在中低端设备上可能造成轻微卡顿或抖动。
- 建议：将临时向量提升到闭包作用域复用，减少每帧分配。

### P3: 客户端 `galaxy-scene` chunk 体积偏大（已知风险）
- 位置：构建产物 `dist/client/_astro/galaxy-scene.*.js`
- 现状：约 `608.06 kB`（minified），gzip `164.94 kB`。
- 说明：本轮聚焦结构收口，不是包体拆分，这点与当前目标一致。
- 后续可选优化：
  - `manualChunks` 拆分 vendor（如 `three`）
  - 进一步按需拆分动态导入
  - 调整 rollup 压缩策略并做基准对比

### P4: 规则匹配优先级需显式说明
- 位置：`src/lib/agent/rule-matcher.ts`
- 现状：先匹配 planet，再匹配 star。
- 风险：当别名冲突时会固定落到 planet，行为是隐式的。
- 建议：补注释说明“planet 优先”是刻意策略，降低后续维护歧义。

### P5: e2e 尚未覆盖 `/api/agent` 的 422 端到端路径
- 位置：`tests/e2e/mvp-smoke.spec.ts`
- 现状：e2e 主要覆盖 happy path；422 由单测覆盖。
- 风险：端到端层面缺少异常输入回归。
- 建议：新增一条空消息或非法消息的 e2e，用于验证 UI 和接口协同行为。

### P6: `flashMeshMaterial` 的定时器未在 cleanup 统一管理
- 位置：`src/lib/browser/galaxy-scene-helpers.ts`
- 现状：`setTimeout` 回调未纳入 scene cleanup。
- 风险：场景销毁瞬间可能触发已释放 material 的回调（低影响）。
- 建议：记录 timer id 并在 cleanup 时清理，或加 mounted/ disposed guard。

### P7: gallery e2e 断言与数据规模存在潜在脆性
- 位置：`tests/e2e/mvp-smoke.spec.ts` 与 `src/data/gallery.ts`
- 现状：测试断言 `.tilt-card` 数量为 4，但数据主列表当前是 3 项。
- 风险：如果模板结构调整，测试可能因“结构耦合”而非功能回归失败。
- 建议：优先断言关键可见行为或关键文案，减少对总数量的硬编码依赖。

## Residual Risks

- 无阻断性问题；本轮验证通过。
- 主要剩余风险：客户端 `galaxy-scene` chunk 体积仍偏大（约 608 kB minified）。
- 次要风险：信息面板 `innerHTML` 拼接在未来接入外部数据时可能引入 XSS。

## 验证结果

- `npm run check`：通过（0 errors / 0 warnings / 0 hints）
- `npm run test`：通过（22/22）
- `npm run test:e2e`：通过（4/4，本轮已有结果）
- `npm run build`：通过；体积告警仍在（`galaxy-scene` chunk > 500 kB）

## 本轮结论

- 这轮没有留下阻断性问题，结构收口目标达成。
- `galaxy-scene` 已成功收缩为编排层，agent 已稳定在 `route -> service -> provider` 边界。
- 对后续接入 LLM 的接口与归一化收口点预留合理，且未在 MVP 引入额外空壳复杂度。
