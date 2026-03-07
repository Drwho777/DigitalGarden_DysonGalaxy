# MVP Runtime And Playwright Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair the current MVP so the Three.js hub and backend AI terminal work in a real locally served environment, then add repeatable Playwright smoke coverage for the main user flows.

**Architecture:** Keep the existing Astro content and UI structure, but move the hub bootstrapping onto a client script path Astro actually bundles and serve the API route in a mode that supports real `POST` requests. Preserve the current backend-driven `{ message, action }` contract and add Playwright against a local app server rather than mocked fetches.

**Tech Stack:** Astro 5, TypeScript, Three.js, Vitest, Playwright

---

### Task 1: Repair Runtime Wiring

**Files:**
- Modify: `astro.config.mjs`
- Modify: `src/components/galaxy/GalaxyScene.astro`
- Create: `src/scripts/galaxy-scene-entry.ts`
- Modify: `src/pages/api/agent.ts`

**Step 1: Move the scene bootstrap into a bundled client entry**

Create `src/scripts/galaxy-scene-entry.ts` that reads the JSON data element and calls `initGalaxyScene`.

**Step 2: Replace the inline import pattern**

Update `src/components/galaxy/GalaxyScene.astro` so it keeps the JSON payload script but loads the new client entry using Astro-supported processing.

**Step 3: Enable real API handling**

Update `astro.config.mjs` so local runtime and Playwright runs support `POST /api/agent`.

**Step 4: Make the API route explicitly non-prerendered if needed**

Update `src/pages/api/agent.ts` to run in the new serving mode without ambiguity.

**Step 5: Verify the app boots**

Run `npm.cmd run build` and `npm.cmd run dev -- --host 127.0.0.1 --port 4321`, then confirm the scene script no longer 404s and `POST /api/agent` is handled without static endpoint warnings.

### Task 2: Clear Current Type Errors

**Files:**
- Modify: `src/lib/browser/galaxy-scene.ts`
- Modify: `src/pages/gallery/[starId]/[planetId].astro`

**Step 1: Fix nullable DOM cleanup in the scene module**

Guard the container teardown path in `src/lib/browser/galaxy-scene.ts`.

**Step 2: Type the gallery DOM interactions correctly**

Update the gallery script so the navbar, cards, and pointer events use concrete DOM types instead of generic `Element` and `Event`.

**Step 3: Run `astro check`**

Expected: the existing 5 blocking TS errors are gone.

### Task 3: Add Playwright Infrastructure

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/mvp-smoke.spec.ts`

**Step 1: Add Playwright as a dev dependency**

Install `@playwright/test`.

**Step 2: Add runnable scripts**

Add scripts for `test:e2e` and a headed or debug-friendly Playwright variant if useful.

**Step 3: Configure Playwright web server startup**

Point the config at the local Astro server with a fixed host and port so the suite is repeatable.

**Step 4: Write smoke coverage for the MVP**

Cover:
- Home page loads without the previous scene bundle 404.
- AI terminal opens and a known prompt produces a teleport response.
- Article route renders expected seeded content.
- Gallery route renders expected cards and interaction shell.

### Task 4: Validate End To End

**Files:**
- Modify: `README.md` if command docs need an update for Playwright.

**Step 1: Run verification**

Run:
- `npm.cmd run check`
- `npm.cmd run test`
- `npx playwright test` or `npm.cmd run test:e2e`
- `npm.cmd run build`

**Step 2: Record any command or workflow changes**

If Playwright or runtime mode changes local developer workflow, update `README.md`.
