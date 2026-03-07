# Digital Garden MVP Design

## Goal

Build a narrow but complete MVP for the Digital Garden using the existing Astro project as the base. The first release should prove the core loop: browse the galaxy hub, inspect a planet, open a real Markdown article, and trigger in-world movement from the AI terminal through a backend action protocol.

## Scope

The MVP includes one 3D hub page, one Markdown reading experience, one gallery page, a small local dataset, and a backend-driven AI terminal. It does not include Supabase reads, RAG, GitHub Action sync, or full agent tooling yet. Those are deferred until the UI, routing, and protocol are stable.

## Architecture

Use Astro for routing and page composition, and keep Three.js plus GSAP in client-side scripts instead of wrapping the scene in React. The top-level layout owns global styling and Astro view transitions. The hub page composes a `GalaxyScene`, a right-side `InfoPanel`, and a left-bottom `AITerminal`.

`GalaxyScene` owns the current interaction state: `GALAXY`, `STAR`, and `PLANET`. It also owns click picking, fly-to transitions, orbit animation, and the mapping from action payloads to camera movement. The info panel reflects the currently focused object and, for planets, lists linked articles before navigation. The AI terminal only sends messages and renders responses; it does not decide movement on its own.

## Data Model

Keep a single local source for galaxy structure in `src/data/galaxy.ts`. This file defines stars, planets, lanes, visual attributes, orbit parameters, and page types. Store real article content in Astro Content Collections under `src/content/nodes/...`.

Define a `nodes` collection in `src/content/config.ts`. Each Markdown entry should include:

- `title`
- `slug`
- `starId`
- `planetId`
- `summary`
- `tags`
- `publishedAt`
- `heroImage`

Use `src/lib/galaxy-data.ts` as the aggregation layer. It combines static galaxy structure with article metadata so the hub, spoke pages, and backend API all read the same derived model.

## Routing

Use semantic hierarchical URLs for articles:

`/read/[starId]/[planetId]/[slug]`

This keeps the `star -> planet -> node` relationship visible in the URL and aligns with the project architecture document. The reading page must validate that the URL matches the Markdown frontmatter and return a 404 on mismatch.

Use a gallery route for gallery planets:

`/gallery/[starId]/[planetId]`

The first hub interaction flow is:

1. Click a star to focus it.
2. Click a planet to focus it and open the right-side panel.
3. Click an article in the panel to navigate to the reading page.
4. Use the return control to go back to the hub.

## AI Protocol

The MVP uses a backend-first protocol with rule-based intent matching. The frontend sends user text to `src/pages/api/agent.ts`. The API reads the same galaxy data used by the UI and matches star names, planet names, and aliases. It returns:

```json
{
  "message": "已锁定数字花园日志专题，准备切入近地轨道。",
  "action": {
    "type": "TELEPORT",
    "targetType": "planet",
    "targetId": "p_garden"
  }
}
```

If no destination is matched, the API returns a normal message with `"action": null`.

This keeps the protocol compatible with the later agent layer while avoiding the complexity of LLM tool-calling in the MVP.

## Error Handling

Fail loudly for invalid content routes. If a Markdown entry is missing or mismatched, return a 404 instead of silently falling back. If a planet has no articles yet, render an explicit empty state in the info panel. If the AI request does not match any target, append the assistant message and do not move the camera. If WebGL setup fails, fall back to a static hub shell so the page still renders basic UI.

## Validation

The MVP is complete when these flows work reliably:

1. The hub renders and supports star and planet focus transitions.
2. A planet panel lists real Markdown-backed articles.
3. An article route renders a real Markdown page at a semantic URL.
4. The reading page returns to the hub cleanly.
5. The AI terminal can teleport to at least one star and one planet using the backend action protocol.

## Deferred Work

Defer the following until after the MVP is stable:

- Supabase reads and writes
- pgvector and RAG flows
- GitHub Action Markdown sync
- LLM-based structured action generation
- More complex gallery and content tooling
