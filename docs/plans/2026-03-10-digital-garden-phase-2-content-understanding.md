# Digital Garden Assistant Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a context-aware assistant that can summarize the current planet or page, distinguish local scope from whole-garden scope, answer high-level overview questions, and prepare the stack for Supabase-backed observability plus scoped vector retrieval.

**Architecture:** Keep navigation deterministic and local. Add a lightweight request `context` contract from each page to `/api/agent`, resolve structured garden context server-side, and let the LLM only organize and explain that context. Split Phase 2 into `2A` (context-aware summaries and onboarding), `2B` (Supabase logging and retrieval groundwork), and `2C` (scoped semantic retrieval over Supabase pgvector).

**Tech Stack:** Astro 5, TypeScript, Astro Content Collections, Vercel AI SDK, Supabase/Postgres, pgvector, Vitest, Playwright

---

## Recommended sequencing

Do **not** parallelize all five Phase 2 bullets immediately.

Use a `trunk + sidecar` sequence:

1. **Trunk (must go first, serial):**
   - expose AI terminal on non-home pages
   - add request context contract
   - build server-side context loader
2. **Rollout order for user-facing acceptance:**
   - ship read page support first
   - open gallery page support second
   - polish hub prompts and onboarding last
3. **Parallel after trunk is green:**
   - scope-aware summary / overview / first-visit guide flows
   - Supabase logging foundation
   - regression coverage and observability
4. **Only after logs and intents are stable:**
   - pgvector schema upgrades
   - scoped semantic retrieval

This is the key dependency:

- “总结当前星球内容”
- “区分当前页面内容与全站内容”
- “花园总览”
- “第一次进入导览”

All four depend on the same structured context layer. Building them separately first would duplicate prompt logic and context assembly.

## Database decision

### What is already enough

The existing schema already covers the core content graph:

- `stars`
- `planets`
- `nodes`
- `node_embeddings`

That means **Phase 2A does not require a new table** if the first implementation loads context from local content collections plus existing `nodes.content_raw` parity rules.

### What should change before vector work

Vector search is not the first blocker for Phase 2. Supabase should deliver value in this order:

1. Add server-only Supabase credentials.
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `EMBEDDING_MODEL`
2. Add assistant event logging first.
   - `assistant_events`
   - `message`
   - `route_type`
   - `star_id`
   - `planet_id`
   - `slug`
   - `interaction_intent`
   - `action_type`
   - `action_target_id`
   - `success`
   - `latency_ms`
   - `created_at`
3. Add incremental refresh metadata.
   - `nodes.content_hash text`
   - `node_embeddings.embedding_model text`
   - `node_embeddings.chunk_token_count integer`
   - `node_embeddings.updated_at timestamptz`
4. Add a scoped RPC for pgvector search.
   - `match_node_embeddings(query_embedding, match_count, filter_star_id, filter_planet_id)`

### What should not be added yet

Do **not** add visitor memory tables, persona tables, or multi-agent workflow tables in Phase 2. They are not required to answer the current product questions and would blur the clean boundary established in Phase 1.

## Task 1: Expose the assistant on page scopes that need understanding

**Files:**
- Modify: `src/components/ai/AITerminal.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/gallery/[starId]/[planetId].astro`
- Modify: `src/pages/read/[starId]/[planetId]/[slug].astro`
- Modify: `src/scripts/home-hub-bootstrap.ts`
- Modify: `src/scripts/gallery-page-bootstrap.ts`
- Modify: `src/scripts/reader-page-bootstrap.ts`
- Modify: `src/lib/browser/ai-terminal.ts`
- Test: `tests/e2e/mvp-smoke.spec.ts`

**Step 1: Write the failing e2e test**

```ts
test('article page can ask for current page summary', async ({ page }) => {
  await page.goto('/read/tech/p_garden/why-3d-galaxy');
  await page.getByLabel('打开 Dyson Brain 终端').click();
  await page.getByPlaceholder('输入导航指令或专题名称...').fill('总结当前页面');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByRole('log')).toContainText('当前这篇文章');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/mvp-smoke.spec.ts`
Expected: FAIL because the read page does not render `AITerminal` and the terminal bootstrap is only mounted on the home page.

**Step 3: Write minimal implementation**

```astro
---
import type { AgentRequestContextInput } from '../../types/agent-context';

interface Props {
  context?: AgentRequestContextInput;
}

const { context = { routeType: 'hub' } } = Astro.props;
---

<section
  id="ai-terminal"
  data-agent-context={JSON.stringify(context)}
  class="glass-panel hidden ..."
>
```

```ts
const rawContext = panel.dataset.agentContext;
const context = rawContext ? JSON.parse(rawContext) : { routeType: 'hub' };

body: JSON.stringify({ message, context })
```

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- tests/e2e/mvp-smoke.spec.ts`
Expected: PASS for terminal presence and request submission on the read page first. Gallery and hub can share the code path, but release acceptance should not block on all three scopes landing at once.

**Step 5: Commit**

```bash
git add src/components/ai/AITerminal.astro src/pages/index.astro src/pages/gallery/[starId]/[planetId].astro src/pages/read/[starId]/[planetId]/[slug].astro src/scripts/home-hub-bootstrap.ts src/scripts/gallery-page-bootstrap.ts src/scripts/reader-page-bootstrap.ts src/lib/browser/ai-terminal.ts tests/e2e/mvp-smoke.spec.ts
git commit -m "feat(agent): expose terminal with route context across pages"
```

## Task 2: Define the request context contract and pass it through `/api/agent`

**Files:**
- Create: `src/types/agent-context.ts`
- Modify: `src/types/agent.ts`
- Modify: `src/pages/api/agent.ts`
- Modify: `src/lib/agent/service.ts`
- Test: `tests/lib/agent-api.test.ts`
- Test: `tests/lib/agent-service.test.ts`

**Step 1: Write the failing test**

```ts
it('passes validated request context through to agentService', async () => {
  const response = await POST({
    request: createRequest(JSON.stringify({
      message: '总结当前页面',
      context: {
        routeType: 'node',
        starId: 'tech',
        planetId: 'p_garden',
        slug: 'why-3d-galaxy',
      },
    })),
  } as Parameters<typeof POST>[0]);

  expect(respondMock).toHaveBeenCalledWith({
    message: '总结当前页面',
    requestId: 'req-test-1',
    context: {
      routeType: 'node',
      starId: 'tech',
      planetId: 'p_garden',
      slug: 'why-3d-galaxy',
    },
  });
  expect(response.status).toBe(200);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/agent-api.test.ts`
Expected: FAIL because the route parser only accepts `{ message }`.

**Step 3: Write minimal implementation**

```ts
export type AgentRouteType = 'hub' | 'planet' | 'node';

export interface AgentRequestContextInput {
  routeType: AgentRouteType;
  starId?: string;
  planetId?: string;
  slug?: string;
}

export interface AgentRequestPayload {
  message: string;
  context?: AgentRequestContextInput;
}
```

```ts
if (context !== undefined && !isValidAgentRequestContext(context)) {
  return createErrorResult(422, '`context` is invalid.');
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/agent-api.test.ts`
Expected: PASS with validated context forwarded unchanged.

**Step 5: Commit**

```bash
git add src/types/agent-context.ts src/types/agent.ts src/pages/api/agent.ts src/lib/agent/service.ts tests/lib/agent-api.test.ts tests/lib/agent-service.test.ts
git commit -m "feat(agent): add structured page context contract"
```

## Task 3: Build a server-side context loader as the shared Phase 2 foundation

**Files:**
- Create: `src/lib/agent/context-loader.ts`
- Create: `tests/lib/agent-context-loader.test.ts`
- Modify: `src/lib/agent/service.ts`
- Modify: `src/lib/galaxy-data.ts`
- Test: `tests/fixtures/galaxy-fixtures.ts`

**Step 1: Write the failing test**

```ts
it('loads planet-scoped context with node summaries and global overview', async () => {
  const result = await loadAgentContext({
    routeType: 'planet',
    starId: 'tech',
    planetId: 'p_garden',
  });

  expect(result.scope).toBe('planet');
  expect(result.currentPlanet?.id).toBe('p_garden');
  expect(result.currentPlanet?.nodes[0]).toMatchObject({
    slug: expect.any(String),
    title: expect.any(String),
    summary: expect.any(String),
  });
  expect(result.globalOverview.stars.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/agent-context-loader.test.ts`
Expected: FAIL because no context loader exists.

**Step 3: Write minimal implementation**

```ts
export interface LoadedAgentContext {
  scope: 'hub' | 'planet' | 'node';
  currentStar?: { id: string; name: string; description: string };
  currentPlanet?: {
    id: string;
    name: string;
    description: string;
    pageType: 'article_list' | 'gallery';
    nodes: Array<{ slug: string; title: string; summary: string; tags: string[] }>;
  };
  currentNode?: {
    slug: string;
    title: string;
    summary: string;
    tags: string[];
    body?: string;
  };
  globalOverview: {
    stars: Array<{ id: string; name: string; planetCount: number; nodeCount: number }>;
  };
}
```

```ts
export async function loadAgentContext(input?: AgentRequestContextInput): Promise<LoadedAgentContext> {
  const galaxy = await getGalaxyData();
  const nodes = await getCollection('nodes');
  // derive current scope from ids and return structured summaries instead of raw page objects
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/agent-context-loader.test.ts`
Expected: PASS for `hub`, `planet`, and `node` scopes.

**Step 5: Commit**

```bash
git add src/lib/agent/context-loader.ts src/lib/agent/service.ts src/lib/galaxy-data.ts tests/lib/agent-context-loader.test.ts tests/fixtures/galaxy-fixtures.ts
git commit -m "feat(agent): add structured context loader for hub planet and node scopes"
```

## Task 4: Add layered interaction intents and scope-aware prompts

**Files:**
- Create: `src/lib/agent/content-intent.ts`
- Modify: `src/lib/agent/chat-service.ts`
- Modify: `src/lib/agent/service.ts`
- Test: `tests/lib/chat-service.test.ts`
- Test: `tests/lib/agent-service.test.ts`
- Create: `tests/lib/content-intent.test.ts`

**Step 1: Write the failing test**

```ts
it('uses interaction intent plus node scope when the user asks to summarize the current page', async () => {
  const service = createChatService({
    loadContext: vi.fn().mockResolvedValue({
      scope: 'node',
      currentNode: {
        slug: 'why-3d-galaxy',
        title: '从平面到宇宙',
        summary: '用宇宙隐喻重建个人知识系统。',
        tags: ['Astro'],
        body: '传统博客默认使用时间线...',
      },
      globalOverview: { stars: [] },
    }),
    resolveModel,
  });

  await service.respond({
    message: '总结当前页面',
    context: { routeType: 'node', starId: 'tech', planetId: 'p_garden', slug: 'why-3d-galaxy' },
  });

  expect(generateTextMock.mock.calls[0][0].system).toContain('交互意图：content_understanding');
  expect(generateTextMock.mock.calls[0][0].system).toContain('当前作用域：node');
  expect(generateTextMock.mock.calls[0][0].system).toContain('只总结当前文章');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/chat-service.test.ts`
Expected: FAIL because the chat prompt only knows the whole-garden catalog and has no context-aware scope rules.

**Step 3: Write minimal implementation**

```ts
export type InteractionIntent =
  | 'navigation'
  | 'content_understanding'
  | 'onboarding'
  | 'general_chat';

export function resolveInteractionIntent(message: string): InteractionIntent {
  if (isNavigationIntent(message)) return 'navigation';
  if (/第一次来|怎么逛|导览|先带我逛/.test(message)) return 'onboarding';
  if (/总结|这里主要讲什么|当前页面|当前星球|这个花园主要写什么/.test(message)) {
    return 'content_understanding';
  }
  return 'general_chat';
}
```

```ts
system: [
  '你不负责决定页面跳转。',
  `交互意图：${intent}`,
  `当前作用域：${context.scope}`,
  createIntentRules(intent, context.scope),
  renderStructuredContext(context),
].join('\n\n')
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/chat-service.test.ts`
Expected: PASS for interaction-intent plus scope-specific prompt construction and no regression for generic chat.

**Step 5: Commit**

```bash
git add src/lib/agent/content-intent.ts src/lib/agent/chat-service.ts src/lib/agent/service.ts tests/lib/chat-service.test.ts tests/lib/agent-service.test.ts tests/lib/content-intent.test.ts
git commit -m "feat(agent): add layered interaction intents for phase 2 prompts"
```

## Task 5: Add Supabase server access and assistant event logging foundation

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `src/env.d.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/observability/assistant-events.ts`
- Create: `tests/lib/supabase-server.test.ts`
- Create: `tests/lib/assistant-events.test.ts`
- Create: `supabase/migrations/20260310_add_assistant_events.sql`
- Modify: `src/pages/api/agent.ts`
- Modify: `README.md`

**Step 1: Write the failing tests**

```ts
it('creates a server-only supabase client with the service role key', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const client = createServerSupabaseClient();

  expect(client).toBeDefined();
});

it('records assistant events with scope and latency metadata', async () => {
  await recordAssistantEvent({
    message: '总结当前页面',
    routeType: 'node',
    starId: 'tech',
    planetId: 'p_garden',
    slug: 'why-3d-galaxy',
    interactionIntent: 'content_understanding',
    actionType: null,
    actionTargetId: null,
    success: true,
    latencyMs: 320,
  });

  expect(insertMock).toHaveBeenCalledWith(
    expect.objectContaining({
      route_type: 'node',
      interaction_intent: 'content_understanding',
      latency_ms: 320,
    }),
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/supabase-server.test.ts tests/lib/assistant-events.test.ts`
Expected: FAIL because there is no server Supabase module, no server-only env contract, and no DB-backed assistant event logger.

**Step 3: Write minimal implementation**

```ts
import { createClient } from '@supabase/supabase-js';

export function createServerSupabaseClient() {
  return createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}
```

```sql
create table if not exists public.assistant_events (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  route_type text not null,
  star_id text,
  planet_id text,
  slug text,
  interaction_intent text not null,
  action_type text,
  action_target_id text,
  success boolean not null,
  latency_ms integer not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.assistant_events enable row level security;

-- No anon/authenticated insert policy.
-- Assistant events stay server-only and are written with service-role access.
```

```ts
export async function recordAssistantEvent(event: AssistantEventInput) {
  const client = createServerSupabaseClient();
  const { error } = await client.from('assistant_events').insert({
    message: event.message,
    route_type: event.routeType,
    star_id: event.starId ?? null,
    planet_id: event.planetId ?? null,
    slug: event.slug ?? null,
    interaction_intent: event.interactionIntent,
    action_type: event.actionType ?? null,
    action_target_id: event.actionTargetId ?? null,
    success: event.success,
    latency_ms: event.latencyMs,
  });

  if (error) throw error;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/supabase-server.test.ts tests/lib/assistant-events.test.ts`
Expected: PASS and `.env.example` documents `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `EMBEDDING_MODEL`.

**Step 5: Commit**

```bash
git add package.json .env.example src/env.d.ts src/lib/supabase/server.ts src/lib/observability/assistant-events.ts tests/lib/supabase-server.test.ts tests/lib/assistant-events.test.ts supabase/migrations/20260310_add_assistant_events.sql src/pages/api/agent.ts README.md
git commit -m "feat(observability): log assistant events to supabase"
```

## Task 6: Add the vector search schema upgrades and scoped RPC

**Files:**
- Create: `supabase/migrations/20260310163000_add_assistant_search_support.sql`
- Modify: `docs/reference/database-architecture.md`
- Test: `supabase/.temp/remote_public_schema.sql`

**Step 1: Write the migration first**

```sql
alter table public.nodes
  add column if not exists content_hash text;

alter table public.node_embeddings
  add column if not exists embedding_model text,
  add column if not exists chunk_token_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create or replace function public.match_node_embeddings(
  query_embedding extensions.vector(1536),
  match_count integer default 6,
  filter_star_id text default null,
  filter_planet_id text default null
)
returns table (
  node_id uuid,
  chunk_index integer,
  content_chunk text,
  similarity double precision
)
language sql
security definer
as $$
  select
    e.node_id,
    e.chunk_index,
    e.content_chunk,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.node_embeddings e
  join public.nodes n on n.id = e.node_id
  where (filter_star_id is null or n.star_id = filter_star_id)
    and (filter_planet_id is null or n.planet_id = filter_planet_id)
  order by e.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
```

**Step 2: Apply the migration to local or remote Supabase**

Run: `supabase db push`
Expected: PASS and schema contains the new columns plus `match_node_embeddings`.

**Step 3: Refresh the schema snapshot**

Run: `supabase db dump --schema public -f supabase/.temp/remote_public_schema.sql`
Expected: PASS and the dumped schema shows `content_hash`, vector metadata columns, and the RPC.

**Step 4: Verify the design contract**

Run: inspect `supabase/.temp/remote_public_schema.sql`
Expected: `node_embeddings` remains private and only the RPC is exposed to `service_role`.

**Step 5: Commit**

```bash
git add supabase/migrations/20260310163000_add_assistant_search_support.sql supabase/.temp/remote_public_schema.sql docs/reference/database-architecture.md
git commit -m "feat(db): add scoped vector search support for assistant context"
```

## Task 7: Build the semantic retrieval service as a Phase 2C sidecar

**Files:**
- Create: `src/lib/agent/knowledge-search.ts`
- Create: `src/lib/ai/embedding.ts`
- Modify: `src/lib/agent/chat-service.ts`
- Create: `tests/lib/knowledge-search.test.ts`
- Modify: `tests/lib/chat-service.test.ts`

**Step 1: Write the failing test**

```ts
it('scopes vector retrieval to the current planet when context is planet-level', async () => {
  const matches = await searchKnowledge({
    query: '这个星球主要在讲什么',
    context: { routeType: 'planet', starId: 'tech', planetId: 'p_garden' },
  });

  expect(rpcMock).toHaveBeenCalledWith('match_node_embeddings', expect.objectContaining({
    filter_planet_id: 'p_garden',
  }));
  expect(matches.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/knowledge-search.test.ts`
Expected: FAIL because no embedding or vector retrieval service exists.

**Step 3: Write minimal implementation**

```ts
export async function searchKnowledge(input: {
  query: string;
  context?: AgentRequestContextInput;
}) {
  const embedding = await embedQuery(input.query);
  const client = createServerSupabaseClient();

  const { data, error } = await client.rpc('match_node_embeddings', {
    query_embedding: embedding,
    match_count: 6,
    filter_star_id: input.context?.starId ?? null,
    filter_planet_id: input.context?.planetId ?? null,
  });

  if (error) throw error;
  return data ?? [];
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/knowledge-search.test.ts`
Expected: PASS with correct scoping for `hub`, `planet`, and `node`.

**Step 5: Commit**

```bash
git add src/lib/agent/knowledge-search.ts src/lib/ai/embedding.ts src/lib/agent/chat-service.ts tests/lib/knowledge-search.test.ts tests/lib/chat-service.test.ts
git commit -m "feat(agent): add scoped semantic retrieval for phase 2 content understanding"
```

## Task 8: Add a lightweight manual acceptance checklist before final regression

**Files:**
- Create: `docs/qa/2026-03-10-phase-2a-assistant-manual-checklist.md`
- Modify: `src/content/nodes/tech/p_garden/digital-garden-assistant-architecture-retrospective.md`

**Step 1: Write the manual checklist**

```md
# Phase 2A Assistant Manual Checklist

- Read page: ask “总结当前页面”
- Planet page: ask “这个星球主要讲什么”
- Hub page: ask “这个花园主要有哪些内容”
- Hub page: ask “我是第一次来，怎么逛比较合适”
- Read page: ask “这个花园主要写什么”，确认回答不会错误缩到当前文章
- Hub page: ask “总结当前页面”，确认 hub scope 的退化策略合理
```

**Step 2: Run the checklist manually**

Run: `npm run dev`
Expected: each case produces scope-correct language and does not accidentally trigger navigation.

**Step 3: Update the retrospective with a short QA note**

```md
- `[~]` Phase 2A manual acceptance checklist added for scope-aware answers
```

**Step 4: Commit**

```bash
git add docs/qa/2026-03-10-phase-2a-assistant-manual-checklist.md src/content/nodes/tech/p_garden/digital-garden-assistant-architecture-retrospective.md
git commit -m "docs(qa): add manual acceptance checklist for phase 2 assistant"
```

## Task 9: Close the loop with regression coverage and prompts that match product language

**Files:**
- Modify: `tests/lib/agent-api.test.ts`
- Modify: `tests/lib/agent-service.test.ts`
- Modify: `tests/lib/chat-service.test.ts`
- Modify: `tests/e2e/mvp-smoke.spec.ts`
- Modify: `src/content/nodes/tech/p_garden/digital-garden-assistant-architecture-retrospective.md`

**Step 1: Add product-level regression cases**

```ts
const phase2Cases = [
  '总结当前页面',
  '总结当前星球内容',
  '这个花园主要有哪些内容',
  '我是第一次来，怎么逛比较合适',
];
```

**Step 2: Run the focused suites**

Run: `npm run test -- tests/lib/agent-api.test.ts tests/lib/agent-service.test.ts tests/lib/chat-service.test.ts`
Expected: PASS

Run: `npm run test:e2e -- tests/e2e/mvp-smoke.spec.ts`
Expected: PASS

**Step 3: Update the retrospective checklist**

```md
- `[~]` 构建当前星球上下文加载层
- `[~]` 支持“总结当前星球内容”
- `[~]` 区分当前页面内容与全站内容
```

**Step 4: Run the full validation set**

Run: `npm run check`
Expected: PASS

Run: `npm run test`
Expected: PASS

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/lib/agent-api.test.ts tests/lib/agent-service.test.ts tests/lib/chat-service.test.ts tests/e2e/mvp-smoke.spec.ts src/content/nodes/tech/p_garden/digital-garden-assistant-architecture-retrospective.md
git commit -m "test(agent): cover phase 2 context-aware assistant flows"
```

## Delivery notes

- **Phase 2A shipping line:** Tasks 1-4 and Task 9
- **Phase 2B operational foundation:** Task 5
- **Phase 2C vector line:** Tasks 6-7
- **Manual acceptance gate:** Task 8
- **Earliest user-visible win:** “总结当前页面 / 当前星球 / 花园总览 / 第一次来怎么逛”
- **Suggested execution slices:**
  - Slice 1: Tasks 1-4, then Task 8, then Task 9
  - Slice 2: Task 5
  - Slice 3: Tasks 6-7
- **Vectors are valuable but not the first gate.** They should come in once the context contract, scope rules, and logs are stable.
