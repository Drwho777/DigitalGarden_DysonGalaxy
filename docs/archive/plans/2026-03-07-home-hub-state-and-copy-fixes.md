# Home Hub State And Copy Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair the remaining homepage hub regressions by fixing visible mojibake copy and restoring the last focused scene view after Astro ClientRouter navigation.

**Architecture:** Keep the existing homepage bootstrap and repeatable mount/unmount flow intact, but extend the scene runtime with an explicit `SceneViewState` snapshot contract. The bootstrap will retain the latest snapshot across `astro:before-swap` and pass it back into the scene on the next mount so the focused target, camera, panel visibility, and back-button state survive the round trip through article pages.

**Tech Stack:** Astro 5, TypeScript browser modules, Three.js, GSAP, Playwright

---

### Task 1: Repair homepage-visible copy sources

**Files:**
- Modify: `src/components/ai/AITerminal.astro`
- Verify only: `src/pages/index.astro`
- Verify only: `src/components/galaxy/InfoPanel.astro`
- Verify only: `src/components/galaxy/GalaxyScene.astro`
- Verify only: `src/lib/browser/galaxy-scene.ts`

**Step 1: Confirm actual mojibake sources with UTF-8-safe reads**

Use Unicode-safe reads to distinguish true bad literals from terminal display issues.

**Step 2: Replace bad homepage copy**

Update only the homepage-visible strings that are actually mojibake, preserving layout and behavior.

### Task 2: Add repeatable scene view snapshots

**Files:**
- Modify: `src/lib/browser/galaxy-scene.ts`
- Modify: `src/scripts/home-hub-bootstrap.ts`

**Step 1: Introduce explicit scene state types**

Add `SceneViewState` and `SceneMountOptions` so the scene can accept an initial snapshot and report later snapshots back to the bootstrap.

**Step 2: Snapshot focus and camera state on cleanup**

Capture:
- focus level
- focus target id/type
- parent star id
- info panel open state
- camera position
- controls target
- any extra scene motion state required to make the restored focused view stable

**Step 3: Restore the focused view on remount**

When `initialViewState` is present, reapply the focused target, camera, info panel content/visibility, and back-button visibility without replaying the terminal command.

### Task 3: Expand the smoke regression

**Files:**
- Modify: `tests/e2e/mvp-smoke.spec.ts`

**Step 1: Strengthen the ClientRouter return test**

Assert that returning from `/read/tech/p_garden/why-3d-galaxy` to `/` restores:
- a mounted canvas
- the `数字花园日志` info panel title
- a visible `hub-back-btn`
- a still-working AI terminal and `/api/agent -> p_garden`

### Task 4: Full validation

**Files:**
- None

**Step 1: Run required commands**

Run:
- `npm.cmd run check`
- `npm.cmd run test`
- `npm.cmd run test:e2e`
- `npm.cmd run build`

**Step 2: Fix regressions before finishing**

Keep changes scoped to homepage hub behavior unless a failing validation exposes a required supporting fix.
