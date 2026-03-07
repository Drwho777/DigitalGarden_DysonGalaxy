# Home Hub Remount And Lazy Scene Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the Astro `ClientRouter` home-hub regression so returning from article/gallery routes fully remounts the galaxy hub, while loading the Three.js scene code only on pages that actually render the hub.

**Architecture:** Move homepage interactivity behind an explicit bootstrap that owns `mount`/`unmount` for the hub. `GalaxyScene` and `AITerminal` become repeatable browser mounts that return cleanup functions, and the bootstrap re-runs on `astro:page-load` after route swaps. The bootstrap will route-gate on `#galaxy-scene-data`, and dynamically import the scene module so non-home routes never pull the Three.js scene runtime.

**Tech Stack:** Astro 5 with `ClientRouter`, TypeScript browser modules, Three.js, GSAP, Playwright, Vitest

---

### Task 1: Add a home bootstrap with explicit lifecycle

**Files:**
- Create: `src/scripts/home-hub-bootstrap.ts`
- Modify: `src/pages/index.astro`
- Modify: `src/components/galaxy/GalaxyScene.astro`

**Step 1: Replace component-driven scene bootstrapping**

Remove the direct scene entry script from `GalaxyScene.astro` so the component only renders the DOM container, fallback element, and JSON data payload.

**Step 2: Create homepage bootstrap**

Create `src/scripts/home-hub-bootstrap.ts` with:
- a route gate that returns early when `#galaxy-scene-data` is missing
- `mountHomeHub()` that reads the JSON payload, mounts the AI terminal, dynamically imports the scene module, and stores both cleanup functions
- `unmountHomeHub()` that safely runs and clears both cleanup functions
- listeners for `astro:page-load` and `astro:before-swap`
- an immediate initial `mountHomeHub()` call for first paint

**Step 3: Attach bootstrap only on the home page**

Load the new bootstrap from `src/pages/index.astro` so article/gallery routes do not ship or execute the home runtime by default.

### Task 2: Refactor browser interactivity into repeatable mounts

**Files:**
- Create: `src/lib/browser/ai-terminal.ts`
- Modify: `src/components/ai/AITerminal.astro`
- Modify: `src/lib/browser/galaxy-scene.ts`

**Step 1: Extract AI terminal behavior**

Move the inline terminal script into `src/lib/browser/ai-terminal.ts` as a mount function that:
- resolves DOM nodes on each mount
- binds open/close/submit listeners
- dispatches `galaxy:action` on successful agent responses
- returns cleanup that removes listeners and aborts any in-flight request

**Step 2: Make the scene module repeatable**

Update `initGalaxyScene()` so it:
- no longer depends on `window.__digitalGardenCleanup`
- no longer self-registers `astro:before-swap`
- mounts against the current DOM and returns a cleanup callback
- leaves cleanup idempotent so repeated unmount calls are safe

**Step 3: Keep non-home pages clean**

The bootstrap must skip scene import and terminal mounting when `#galaxy-scene-data` is absent, which prevents article/gallery routes from binding homepage interactions.

### Task 3: Extend regression coverage

**Files:**
- Modify: `tests/e2e/mvp-smoke.spec.ts`

**Step 1: Add a ClientRouter back-navigation regression**

Cover:
- `/` renders a scene canvas
- navigate to `/read/tech/p_garden/why-3d-galaxy`
- go back to `/`
- scene canvas is mounted again
- AI terminal opens and submits after returning
- the `/api/agent` response contains `targetId: 'p_garden'`
- the info panel updates to `数字花园日志`

**Step 2: Preserve existing smoke coverage**

Keep the current direct-home, article, and gallery smoke tests passing.

### Task 4: Full validation

**Files:**
- None

**Step 1: Run required checks**

Run:
- `npm.cmd run check`
- `npm.cmd run test`
- `npm.cmd run test:e2e`
- `npm.cmd run build`

**Step 2: Fix any regressions**

Address any type, test, router-lifecycle, or bundling failures discovered by the required commands before finishing.
