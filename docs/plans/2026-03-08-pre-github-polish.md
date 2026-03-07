# Pre-GitHub Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tighten repository hygiene, harden the MVP runtime edges, and reduce obvious technical debt without changing current behavior or regressing the home-hub remount/state-restore baseline.

**Architecture:** Keep the existing Astro plus browser-module split and isolate polish work into four bounded areas: repository hygiene, ClientRouter-safe page bootstraps, `/api/agent` request validation, and a minimal `galaxy-scene` decomposition. Preserve the current `{ message, action }` response contract and the existing home-hub bootstrap lifecycle.

**Tech Stack:** Astro 5, TypeScript, Three.js, GSAP, Vitest, Playwright

---

### Task 1: Repository Hygiene And Release Guardrails

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `package-lock.json`
- Move: `3d_garden_prototype.html`
- Move: `anime_gallery.html`
- Move: `planet_reader.html`
- Move: `ai_cli_prompt.md`
- Move: `database_architecture.md`
- Move: `docs/plans/2026-03-06-digital-garden-mvp-design.md`
- Move: `docs/plans/2026-03-06-digital-garden-mvp-implementation.md`
- Move: `docs/plans/2026-03-07-home-hub-remount-and-lazy-scene.md`
- Move: `docs/plans/2026-03-07-home-hub-state-and-copy-fixes.md`
- Move: `docs/plans/2026-03-07-mvp-runtime-and-playwright.md`
- Modify: `README.md`

**Steps:**
1. Expand `.gitignore` for Codex/runtime/history/test artifacts, local logs, temp files, and `.env*` variants while keeping `.env.example` trackable.
2. Mark the package private, add a release-safe description, remove unused `lucide`, and move `@types/three` to `devDependencies`.
3. Re-home historical prototypes and planning/reference notes under `docs/archive/...` or `docs/reference/...` without deleting user-authored source material.
4. Update `README.md` so the new locations are discoverable.

### Task 2: ClientRouter-Safe Page Lifecycle Bootstraps

**Files:**
- Modify: `src/pages/gallery/[starId]/[planetId].astro`
- Modify: `src/pages/read/[starId]/[planetId]/[slug].astro`
- Create: `src/scripts/gallery-page-bootstrap.ts`
- Create: `src/scripts/reader-page-bootstrap.ts`
- Create: `src/lib/browser/navbar-scroll.ts`
- Create: `src/lib/browser/tilt-cards.ts`
- Create: `src/data/gallery.ts`

**Steps:**
1. Move inline `scroll` and `mousemove` behavior into mount/unmount browser helpers.
2. Use `astro:before-swap` cleanup plus `astro:page-load` remount, matching the established home-hub bootstrap model.
3. Keep the gallery tilt interaction and navbar hide/show behavior visually unchanged.
4. If low-cost, pull hard-coded gallery exhibit content into `src/data/...`.

### Task 3: Harden `/api/agent` And Add Tests

**Files:**
- Modify: `src/pages/api/agent.ts`
- Create: `tests/lib/agent-api.test.ts`

**Steps:**
1. Distinguish invalid JSON from semantically invalid payloads.
2. Return `400` for malformed JSON and `422` for missing or non-string `message`.
3. Keep successful responses on the existing `{ message, action }` contract, including the `p_garden` behavior.
4. Add unit coverage for malformed JSON, missing `message`, non-string `message`, and a valid garden prompt.

### Task 4: Minimal `galaxy-scene` Decomposition And Test Lift

**Files:**
- Modify: `src/lib/browser/galaxy-scene.ts`
- Create: `src/lib/browser/galaxy-scene-panel.ts`
- Create: `src/lib/browser/galaxy-scene-view-state.ts`
- Create: `src/lib/browser/galaxy-scene-helpers.ts`
- Modify: `tests/lib/galaxy-scene.test.ts`

**Steps:**
1. Extract pure helpers and scene view-state serialization helpers out of the main file.
2. Extract panel rendering into a dedicated browser module.
3. Update scene tests to cover the newly isolated helpers instead of leaving all logic trapped in one file.
4. Keep the home page scene public API stable so the current bootstrap and state-restore chain keeps working.

### Task 5: Cross-Platform E2E Server Setup And Full Validation

**Files:**
- Modify: `playwright.config.ts`

**Steps:**
1. Replace the Windows-only `npm.cmd` command with a shell-safe cross-platform `npm run dev -- --host ...` command.
2. Make server reuse explicit opt-in instead of the current default-on local behavior.
3. Run:
- `npm.cmd run check`
- `npm.cmd run test`
- `npm.cmd run test:e2e`
- `npm.cmd run build`
4. Fix any regressions introduced by the polish work before finishing.
