# Retrieval Quality Checklist (2026-03-11)

## Purpose

Verify that semantic retrieval improves recall-oriented answers without breaking deterministic scope boundaries, factual grounding, or article existence checks.

## Hard Pass Rules

- Retrieval must not widen scope incorrectly. `node` stays node-first, `planet` stays within the current planet, and `hub` stays whole-garden.
- Retrieval must not invent nonexistent stars, planets, or articles.
- Retrieval may enrich the answer, but it must not replace structured local context.
- `ENABLE_SEMANTIC_RETRIEVAL` remains the only runtime switch.

## Verification Setup

- Date: `2026-03-11`
- Local baseline: `npm run dev` on `http://127.0.0.1:4321` with retrieval disabled
- Local enabled run: `npm run dev` on `http://127.0.0.1:4322` with `ENABLE_SEMANTIC_RETRIEVAL=true`
- Model: `@cf/zai-org/glm-4.7-flash`
- Embedding backfill state: `4` nodes, `43` chunks, model `@cf/qwen/qwen3-embedding-0.6b`

## Prompt Set

| ID | Scope | Prompt | Baseline | Enabled | Verdict |
| --- | --- | --- | --- | --- | --- |
| `node-summary` | `node` | `总结当前页面` | Focused on the current article and stayed inside the current node. | Still stayed inside the current node. No retrieval path is used for node scope. | Equivalent |
| `planet-summary` | `planet` | `总结当前星球内容` | Summarized the `p_garden` planet and listed the three tech articles. | Same scope and article set. Retrieval did not widen to other stars. | Equivalent |
| `hub-overview` | `hub` | `这个花园主要有哪些内容` | Covered the three stars and recent nodes correctly. | Stayed hub-scoped and factual, but the answer was less direct. | Equivalent |
| `onboarding` | `hub` | `我是第一次来，怎么逛比较合适` | Gave a usable first-visit route and stayed inside real stars. | Still stayed inside real stars, but wording quality varied. Retrieval is not used on onboarding prompts. | Equivalent |
| `theme-recap` | `planet` | `这个星球主要围绕什么主题？` | Correctly described the digital-garden/3D-blog theme. | Same scope and same topic, with no fabricated content. | Equivalent |
| `related-performance` | `planet` | `有没有讲性能优化的相关文章？` | Mentioned the planet articles, but the performance article was not surfaced clearly. | Explicitly surfaced `Astro 与 Three.js 共存时，首屏性能应该先守住什么？`. | Improved |
| `recent-updates` | `hub` | `最近更新了什么` | Mentioned recent work, but the answer was broad and less grounded in recent nodes. | Used the recent-node context more directly and stayed factual. | Improved |
| `relationship-explainer` | `node` | `这篇文章和数字花园日志里的其他内容是什么关系？` | Stayed in the current node and current planet. | Also stayed in scope. Retrieval is not used for node scope, so variance here is model-only. | Equivalent |

## Outcome

- Improved prompts:
  - `related-performance`
  - `recent-updates`
- Equivalent prompts:
  - `node-summary`
  - `planet-summary`
  - `hub-overview`
  - `onboarding`
  - `theme-recap`
  - `relationship-explainer`
- Regressions that block enablement:
  - None on scope, factuality, or article existence

## Decision

The retrieval quality gate passes for the current local verification set.

Reasons:

- Retrieval improved recall-oriented prompts without widening scope.
- No enabled-path prompt invented missing stars, planets, or articles.
- Node-scope and onboarding variance did not come from retrieval, because those paths remain deterministic/local-first without semantic retrieval.

Operational guidance:

- Keep `ENABLE_SEMANTIC_RETRIEVAL` opt-in and off by default in shared example config.
- Re-run this checklist after any embedding-model change, vector-dimension migration, or large content backfill.
