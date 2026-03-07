# Structure Closure Round 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Further shrink the galaxy scene runtime, unify the agent service boundary, clean remaining user-visible mojibake, and leave a clear extension point for future LLM integration without changing current behavior.

**Architecture:** Keep `src/lib/browser/galaxy-scene.ts` as an orchestration layer by extracting pure scene logic and DOM bridge helpers into focused modules. Reshape `/api/agent` into route parsing plus service execution, with a rule-based provider behind a small `AgentService` interface and a future LLM stub that shares response normalization.

**Tech Stack:** Astro, TypeScript, Vitest, Playwright, Three.js, GSAP

---

### Task 1: Lock the target seams with tests

**Files:**
- Modify: `tests/lib/agent-api.test.ts`
- Modify: `tests/lib/rule-matcher.test.ts`
- Modify: `tests/lib/galaxy-scene.test.ts`
- Create: `tests/lib/agent-service.test.ts`

**Step 1: Write failing or tightening tests**

- Assert route-level `400 / 422 / 200` behavior still holds and the successful JSON payload remains `{ message, action }`.
- Assert the new agent service trims input, delegates to the provider, and preserves the `p_garden` teleport behavior.
- Assert extracted galaxy scene helper/state logic is independently testable and keeps the current thresholds and target-state semantics.

**Step 2: Run the focused test commands**

Run: `npm.cmd run test -- tests/lib/agent-api.test.ts tests/lib/agent-service.test.ts tests/lib/rule-matcher.test.ts tests/lib/galaxy-scene.test.ts`

Expected: failures for missing modules or changed expectations before implementation.

### Task 2: Shrink the galaxy scene runtime into orchestration + helpers

**Files:**
- Modify: `src/lib/browser/galaxy-scene.ts`
- Create: `src/lib/browser/galaxy-scene-runtime.ts`
- Create: `src/lib/browser/galaxy-scene-interaction.ts`
- Create: `src/lib/browser/galaxy-scene-camera.ts`
- Modify: `src/lib/browser/galaxy-scene-helpers.ts`
- Modify: `src/lib/browser/galaxy-scene-panel.ts`

**Step 1: Extract pure or mostly pure helpers first**

- Move scene construction records, lane packet creation helpers, focus-distance threshold logic, and other stateless helpers out of `galaxy-scene.ts`.
- Keep DOM lookup and panel rendering behind dedicated bridge functions instead of spreading selectors across orchestration code.

**Step 2: Recompose `initGalaxyScene` as orchestration**

- Keep setup and cleanup order stable.
- Preserve home-hub mount/unmount and view-state restore behavior.
- Keep camera offsets, click behavior, and animation visuals unchanged.

### Task 3: Unify agent route and service boundaries

**Files:**
- Create: `src/lib/agent/types.ts`
- Create: `src/lib/agent/service.ts`
- Create: `src/lib/agent/providers/rule-based.ts`
- Create: `src/lib/agent/providers/llm.ts`
- Modify: `src/lib/agent/request-validation.ts`
- Modify: `src/lib/agent/rule-matcher.ts`
- Modify: `src/pages/api/agent.ts`

**Step 1: Move business behavior into the service layer**

- Route layer only parses the request, calls the service, and serializes the returned status and payload.
- Service layer owns input normalization, provider execution, and response normalization.
- Rule matcher becomes a provider detail instead of the route dependency.

**Step 2: Leave a real LLM seam without network calls**

- Define the provider interface and a stubbed future LLM provider with a clear not-implemented path that is not wired into runtime.
- Centralize response and action types so future tool mapping and telemetry can attach to the service layer.

### Task 4: Clean user-visible mojibake and low-cost copy debt

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/components/ai/AITerminal.astro`
- Modify: `src/components/galaxy/GalaxyScene.astro`
- Modify: `src/components/galaxy/InfoPanel.astro`
- Modify: `src/components/shared/GalaxyHeader.astro`
- Modify: `src/components/shared/TardisReturnLink.astro`
- Modify: `src/pages/gallery/[starId]/[planetId].astro`
- Modify: `src/pages/read/[starId]/[planetId]/[slug].astro`
- Modify: `src/data/galaxy.ts`
- Modify: `src/data/gallery.ts`
- Modify: `src/content/nodes/tech/p_garden/why-3d-galaxy.md`
- Modify: `src/content/nodes/tech/p_garden/astro-3d-performance.md`
- Modify: `src/content/nodes/phil/p_exist/existential-cyberspace.md`
- Modify: `tests/fixtures/galaxy-fixtures.ts`

**Step 1: Fix only user-visible bad literals**

- Replace mojibake in visible labels, helper text, fallback messages, panel copy, and seeded content.
- Keep structure, pacing, and copy intent stable.

### Task 5: Full verification

Run: `npm.cmd run check`

Run: `npm.cmd run test`

Run: `npm.cmd run test:e2e`

Run: `npm.cmd run build`

Expected: all green with current route contract and home hub behavior intact.
