# 语义检索质量验收清单（2026-03-11）

## 目的

验证语义检索是否确实提升了偏“召回型”的回答，同时不破坏确定性的作用域边界、事实准确性和文章存在性校验。

## 硬性通过标准

- 检索结果不能错误扩展作用域。`node` 仍然以当前文章为主，`planet` 仍然限制在当前星球内，`hub` 仍然是全花园范围。
- 检索结果不能虚构不存在的恒星、行星或文章。
- 检索可以补充回答，但不能取代本地结构化上下文。
- `ENABLE_SEMANTIC_RETRIEVAL` 仍然是唯一的运行时开关。

## 验证环境

- 日期：`2026-03-11`
- 本地基线：`npm run dev`，地址 `http://127.0.0.1:4321`，关闭语义检索
- 本地开启态：`npm run dev`，地址 `http://127.0.0.1:4322`，设置 `ENABLE_SEMANTIC_RETRIEVAL=true`
- 使用模型：`@cf/zai-org/glm-4.7-flash`
- Embedding 回填状态：`4` 个节点、`43` 个 chunks，模型 `@cf/qwen/qwen3-embedding-0.6b`

## Prompt 集

| ID | Scope | Prompt | 关闭检索时 | 开启检索时 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `node-summary` | `node` | `总结当前页面` | 能聚焦当前文章，且没有越出当前节点。 | 仍然停留在当前节点。`node` 作用域本身不会走检索。 | 等价 |
| `planet-summary` | `planet` | `总结当前星球内容` | 能总结 `p_garden`，并正确列出 3 篇技术文章。 | 作用域和文章集合保持一致，没有扩展到其他恒星。 | 等价 |
| `hub-overview` | `hub` | `这个花园主要有哪些内容` | 能正确覆盖 3 个恒星主题和最近节点。 | 仍然保持 hub 范围且内容属实，但表达没有明显更直接。 | 等价 |
| `onboarding` | `hub` | `我是第一次来，怎么逛比较合适` | 能给出可用的首次访问路线，且只引用真实存在的星球。 | 仍然只引用真实星球，但措辞质量有波动。`onboarding` 路径本身不走检索。 | 等价 |
| `theme-recap` | `planet` | `这个星球主要围绕什么主题？` | 能正确描述数字花园 / 3D 博客这个主题。 | 主题与范围保持一致，没有虚构内容。 | 等价 |
| `related-performance` | `planet` | `有没有讲性能优化的相关文章？` | 会提到当前星球文章，但没有明显把性能文章挑出来。 | 能明确指出《Astro 与 Three.js 共存时，首屏性能应该先守住什么？》。 | 提升 |
| `recent-updates` | `hub` | `最近更新了什么` | 会提到最近工作，但回答偏宽泛，对 recent nodes 的利用不够直接。 | 更直接利用最近更新节点，且保持事实准确。 | 提升 |
| `relationship-explainer` | `node` | `这篇文章和数字花园日志里的其他内容是什么关系？` | 保持在当前文章和当前星球范围内。 | 同样没有越出范围。由于 `node` 作用域不走检索，这里的波动主要来自模型本身。 | 等价 |

## 结果

- 有提升的 Prompt：
  - `related-performance`
  - `recent-updates`
- 基本等价的 Prompt：
  - `node-summary`
  - `planet-summary`
  - `hub-overview`
  - `onboarding`
  - `theme-recap`
  - `relationship-explainer`
- 会阻止启用的回归：
  - 无。没有发现 scope、事实性或文章存在性上的阻断问题。

## 结论

在当前这组本地验证样本上，语义检索质量门通过。

原因：

- 检索确实改善了偏召回型的问题，但没有错误扩大作用域。
- 开启检索后，没有出现虚构星球、虚构文章或错误引用不存在内容的情况。
- `node` 和 `onboarding` 路径的差异并非来自检索，因为这两条路径仍然是 deterministic / local-first。

## 操作建议

- 继续把 `ENABLE_SEMANTIC_RETRIEVAL` 作为显式 opt-in 开关，并在共享示例配置里默认保持关闭。
- 只要更换了 embedding 模型、向量维度，或者做了大规模内容 backfill，都应重新跑一遍这份清单。
