# Digital Garden Phase 2 Completion and Vector Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish Phase 2 content-understanding as a product-complete slice, then add the minimum indexing and embedding pipeline needed to turn scoped vector retrieval from an empty path into a usable capability.

**Architecture:** Keep navigation deterministic and local. Treat Phase 2A as the product gate: the assistant must reliably answer current-page, current-planet, whole-garden overview, and first-visit onboarding questions using structured local context first. Only after that gate is green should we enable vector-backed recall, and even then it should remain an augmentation layer behind feature flags and data-availability checks rather than a runtime dependency of navigation or baseline summarization. Markdown sync and embedding backfill are offline operator or CI jobs only; they must never run on the SSR request path or be triggered from the browser.

**Tech Stack:** Astro 5, TypeScript, Astro Content Collections, Vercel AI SDK, Supabase/Postgres, pgvector, Vitest, Playwright

---

## Sequencing

Ship this in five slices:

0. **Schema readiness gate**
   - verify the target Supabase schema before touching app code
   - patch schema drift first if anything required by the plan is missing
1. **Phase 2A done-definition**
   - richer hub context
   - stronger prompt rules
   - unit/e2e/manual coverage
2. **Phase 2A observability hardening and feature flag**
   - confirm `assistant_events` captures `content_understanding` and `onboarding`
   - avoid paying embedding cost before an index exists
3. **Vector readiness**
   - one-shot Markdown -> `nodes` sync
   - transactional chunking and embedding backfill into `node_embeddings`
4. **Retrieval quality gate and enablement**
   - verify retrieval helps without breaking scope boundaries
   - turn semantic retrieval on only after backfill and quality checks are green

Do not start the sync or backfill work before the schema gate and the Phase 2A product slice are green.

## Task 0: Add a schema readiness gate before app changes

**Files:**
- Verify: `supabase/migrations/20260308_create_digital_garden_schema.sql`
- Verify: `supabase/migrations/20260310_add_assistant_events.sql`
- Verify: `supabase/migrations/20260310163000_add_assistant_search_support.sql`
- Modify if needed: `docs/reference/database-architecture.md`
- Modify if needed: `supabase/.temp/remote_public_schema.sql`
- Create if needed: `supabase/migrations/20260311103000_phase2_schema_readiness_patch.sql`

**Step 1: Write the schema verification checklist**

Capture the exact readiness criteria in the task notes before changing app code:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'nodes'
  and column_name = 'content_hash';

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'node_embeddings'
  and column_name in ('embedding_model', 'chunk_token_count', 'updated_at');

select conname
from pg_constraint
where conname = 'node_embeddings_node_chunk_key';

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'node_embeddings';

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'match_node_embeddings';
```

Required results:

- `nodes.content_hash` exists
- `node_embeddings.embedding_model / chunk_token_count / updated_at` exist
- `node_embeddings_node_chunk_key` exists
- the HNSW index on `node_embeddings.embedding` exists
- `match_node_embeddings` exists
- `assistant_events` has the fields needed by the remote checks

**Step 2: Run the readiness check**

Run: `supabase db dump --schema public -f supabase/.temp/remote_public_schema.sql`

Expected: PASS and the dump file is generated.

Run: `rg -n "content_hash|node_embeddings_node_chunk_key|using hnsw|assistant_events|match_node_embeddings" supabase/.temp/remote_public_schema.sql`

Expected: PASS and all required schema markers are present.

**Step 3: Patch drift before continuing**

If any required object is missing, create a migration before touching app code:

```sql
alter table public.nodes
  add column if not exists content_hash text;

create index if not exists node_embeddings_embedding_idx
  on public.node_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);
```

Also update `docs/reference/database-architecture.md` if the schema contract changed while patching drift.

**Step 4: Re-apply and re-dump**

Run: `supabase db push`

Expected: PASS

Run: `supabase db dump --schema public -f supabase/.temp/remote_public_schema.sql`

Expected: PASS and the readiness markers are now visible in the dump.

**Step 5: Commit if the gate changed tracked files**

If a patch migration or docs update was needed:

```bash
git add supabase/migrations/20260311103000_phase2_schema_readiness_patch.sql supabase/.temp/remote_public_schema.sql docs/reference/database-architecture.md
git commit -m "chore(db): add phase 2 schema readiness patch"
```

If no tracked files changed, record in the execution log that the gate passed and continue without a commit.

## Task 1: Enrich the shared hub context so whole-garden answers have real structure

**Files:**
- Modify: `src/lib/agent/context-loader.ts`
- Modify: `tests/lib/agent-context-loader.test.ts`
- Modify: `tests/fixtures/galaxy-fixtures.ts`

**Step 1: Write the failing tests**

Add a hub-context assertion that requires more than a star list:

```ts
it('returns featured planets and recent nodes in hub scope', async () => {
  const result = await loadAgentContext({ routeType: 'hub' });

  expect(result.scope).toBe('hub');
  expect(result.globalOverview.featuredPlanets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'p_garden',
        name: expect.any(String),
        starId: 'tech',
      }),
    ]),
  );
  expect(result.globalOverview.recentNodes[0]).toMatchObject({
    slug: expect.any(String),
    title: expect.any(String),
    planetId: expect.any(String),
    starId: expect.any(String),
  });
});

it('always returns empty arrays instead of undefined when the garden is sparse', async () => {
  const result = await loadAgentContext({ routeType: 'hub' });

  expect(Array.isArray(result.globalOverview.featuredPlanets)).toBe(true);
  expect(Array.isArray(result.globalOverview.recentNodes)).toBe(true);
});
```

Extend the fixtures to match the new shape so prompt tests can reuse them.

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/agent-context-loader.test.ts`

Expected: FAIL because `LoadedAgentContext['globalOverview']` only contains `stars`.

**Step 3: Write minimal implementation**

Extend the hub model with stable, deterministic summaries:

```ts
export interface LoadedAgentContext {
  // ...
  globalOverview: {
    stars: AgentContextStarSummary[];
    featuredPlanets: Array<{
      id: string;
      name: string;
      description: string;
      nodeCount: number;
      pageType: 'article_list' | 'gallery';
      starId: string;
      starName: string;
    }>;
    recentNodes: Array<{
      slug: string;
      title: string;
      summary: string;
      publishedAt: string;
      planetId: string;
      planetName: string;
      starId: string;
      starName: string;
    }>;
  };
}
```

Build `featuredPlanets` from hydrated planets with `nodeCount > 0`, sorted by `nodeCount` then freshness. Build `recentNodes` from hydrated articles, sorted by `publishedAt desc`, capped to 5. Both arrays must always exist, even if empty, so prompt and UI code do not need `undefined` fallbacks or special-case branching.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/agent-context-loader.test.ts`

Expected: PASS and the fixture shape matches production context.

**Step 5: Commit**

```bash
git add src/lib/agent/context-loader.ts tests/lib/agent-context-loader.test.ts tests/fixtures/galaxy-fixtures.ts
git commit -m "feat(agent): enrich hub context for phase 2 overview flows"
```

## Task 2: Tighten prompt rules for garden overview and first-visit onboarding

**Files:**
- Modify: `src/lib/agent/chat-service.ts`
- Modify: `tests/lib/chat-service.test.ts`
- Modify: `tests/lib/content-intent.test.ts`

**Step 1: Write the failing tests**

Add prompt assertions for the two unfinished Phase 2 questions:

```ts
it('builds a hub overview prompt for whole-garden questions', async () => {
  await service.respond({ message: '这个花园主要有哪些内容' });

  expect(generateTextMock.mock.calls[0][0].system).toContain('交互意图：content_understanding');
  expect(generateTextMock.mock.calls[0][0].system).toContain('当前作用域：hub');
  expect(generateTextMock.mock.calls[0][0].system).toContain('按主题概览整个花园');
  expect(generateTextMock.mock.calls[0][0].system).toContain('代表星球');
  expect(generateTextMock.mock.calls[0][0].system).toContain('最近更新');
});

it('builds a route-oriented onboarding prompt for first-visit questions', async () => {
  await service.respond({ message: '我是第一次来，怎么逛比较合适' });

  expect(generateTextMock.mock.calls[0][0].system).toContain('交互意图：onboarding');
  expect(generateTextMock.mock.calls[0][0].system).toContain('先介绍整个花园结构');
  expect(generateTextMock.mock.calls[0][0].system).toContain('给出 2 到 4 条适合第一次进入的路线');
  expect(generateTextMock.mock.calls[0][0].system).toContain('featuredPlanets');
});
```

Keep the content-intent test explicit:

```ts
expectIntent('这个花园主要有哪些内容', 'content_understanding');
expectIntent('我是第一次来，怎么逛比较合适', 'onboarding');
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/chat-service.test.ts tests/lib/content-intent.test.ts`

Expected: FAIL because the hub prompt is still too generic and does not instruct a structured overview or route-oriented onboarding.

**Step 3: Write minimal implementation**

Strengthen `createIntentRules()` and `renderStructuredContext()`:

```ts
case 'content_understanding':
  switch (context.scope) {
    case 'hub':
      return [
        '按主题概览整个花园，而不是缩成单篇文章摘要。',
        '先说明主要内容板块，再给出每个板块的代表星球或代表文章。',
        '如果上下文里有 recentNodes，可以用它补充“最近更新”。',
      ].join('\n');
  }

case 'onboarding':
  switch (context.scope) {
    case 'hub':
      return [
        '先介绍整个花园结构。',
        '给出 2 到 4 条适合第一次进入的路线，每条路线都必须锚定真实星球或文章。',
        '路线是建议，不是自动跳转。',
      ].join('\n');
  }
```

Render the new context sections with explicit labels, for example:

```ts
function renderFeaturedPlanets(context: LoadedAgentContext) {
  return [
    'featuredPlanets:',
    ...context.globalOverview.featuredPlanets.map((planet) =>
      `- ${planet.name}（planet:${planet.id}）: ${planet.description}`,
    ),
  ].join('\n');
}
```

When `featuredPlanets` or `recentNodes` is empty, the prompt should still stay stable and explicit:

```ts
return ['featuredPlanets:', '- 当前还没有可用的代表星球。'].join('\n');
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/chat-service.test.ts tests/lib/content-intent.test.ts`

Expected: PASS with stronger prompt instructions and no change to navigation boundaries.

**Step 5: Commit**

```bash
git add src/lib/agent/chat-service.ts tests/lib/chat-service.test.ts tests/lib/content-intent.test.ts
git commit -m "feat(agent): finish phase 2 hub overview and onboarding prompts"
```

## Task 3: Add end-to-end coverage for the two unfinished Phase 2 questions

**Files:**
- Modify: `tests/e2e/mvp-smoke.spec.ts`
- Modify: `docs/qa/2026-03-10-phase-2a-assistant-manual-checklist.md`

**Step 1: Write the failing e2e tests**

Add one mocked garden-overview test and one guardrail test:

```ts
test('home page terminal can answer whole-garden overview questions with hub context', async ({ page }) => {
  const getLastRequestBody = await mockHubOverviewRoute(page);

  await page.goto('/');
  await openTerminal(page);
  await page.locator('#ai-terminal-input').fill('这个花园主要有哪些内容');
  await page.locator('#ai-terminal-send').click();

  await expect(page.locator('#ai-terminal-history')).toContainText('这个花园目前主要有');
  expect(getLastRequestBody()).toEqual({
    context: { routeType: 'hub' },
    message: '这个花园主要有哪些内容',
  });
});

test('article page asking about the whole garden does not collapse to current article scope', async ({ page }) => {
  await page.goto('/read/tech/p_garden/why-3d-galaxy');
  await openTerminal(page);
  await page.locator('#ai-terminal-input').fill('这个花园主要有哪些内容');
  await page.locator('#ai-terminal-send').click();

  await expect(page.locator('#ai-terminal-history')).not.toContainText('只谈当前这篇文章');
});
```

Update the manual checklist to require:

- hub overview
- first-visit guide
- read-page whole-garden question staying at whole-garden scope

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/mvp-smoke.spec.ts`

Expected: FAIL because the new route mock or helper and assertions do not exist yet.

**Step 3: Write minimal implementation**

Add `mockHubOverviewRoute(page)` alongside the existing mock helpers and keep the request body assertion identical to the hub onboarding test pattern.

Do not change runtime code in this task unless the browser payload is actually wrong; this task is meant to prove the current page context contract in the UI layer.

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- tests/e2e/mvp-smoke.spec.ts`

Expected: PASS for overview, onboarding, and scope guardrails.

**Step 5: Commit**

```bash
git add tests/e2e/mvp-smoke.spec.ts docs/qa/2026-03-10-phase-2a-assistant-manual-checklist.md
git commit -m "test(agent): cover phase 2 whole-garden overview flows"
```

## Task 4: Close the observability gap for Phase 2 intents

**Files:**
- Modify: `tests/lib/agent-api.test.ts`
- Modify: `tests/integration/assistant-events.remote.test.mjs`
- Modify: `tests/integration/assistant-events.vercel.remote.test.mjs`
- Modify: `README.md`

**Step 1: Write the failing tests**

Add local API assertions that `assistant_events` receive the correct intent for the two Phase 2 questions:

```ts
it('records content_understanding for hub overview questions', async () => {
  await POST({
    request: createRequest(JSON.stringify({
      message: '这个花园主要有哪些内容',
      context: { routeType: 'hub' },
    })),
  } as Parameters<typeof POST>[0]);

  expect(recordAssistantEventMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      interactionIntent: 'content_understanding',
      routeType: 'hub',
    }),
  );
});

it('records onboarding for first-visit questions', async () => {
  await POST({
    request: createRequest(JSON.stringify({
      message: '我是第一次来，怎么逛比较合适',
      context: { routeType: 'hub' },
    })),
  } as Parameters<typeof POST>[0]);

  expect(recordAssistantEventMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      interactionIntent: 'onboarding',
      routeType: 'hub',
    }),
  );
});
```

Extend the remote tests to hit one non-navigation prompt in addition to navigation and verify a matching row appears in `assistant_events`. Use a unique test message suffix or request fingerprint so the remote query matches a single request under polling.

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/agent-api.test.ts`

Expected: FAIL if the new cases are not present.

**Step 3: Write minimal implementation**

If the local tests already pass, keep runtime code unchanged and only add the missing remote verification case plus README instructions.

Do not replace the existing poll-based remote verification with a single read. Reuse the current polling helper and strengthen the match key:

```md
- `assistant_events` should eventually show `content_understanding` and `onboarding`, not only `navigation`
- remote verification should poll for 10-30 seconds and match by a unique message fingerprint
- run the remote test after deploying Phase 2A changes
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/agent-api.test.ts`

Expected: PASS

Run: `npm run test:integration:assistant-events`

Expected: PASS against a configured remote environment and the latest polled row includes a Phase 2 intent.

**Step 5: Commit**

```bash
git add tests/lib/agent-api.test.ts tests/integration/assistant-events.remote.test.mjs tests/integration/assistant-events.vercel.remote.test.mjs README.md
git commit -m "test(observability): verify phase 2 assistant intents in assistant events"
```

## Task 5: Gate semantic retrieval so Phase 2 does not depend on an empty vector index

**Files:**
- Create: `src/lib/agent/semantic-retrieval.ts`
- Modify: `src/lib/agent/chat-service.ts`
- Modify: `src/lib/agent/knowledge-search.ts`
- Modify: `src/lib/ai/embedding.ts`
- Modify: `.env.example`
- Modify: `src/env.d.ts`
- Create: `tests/lib/semantic-retrieval.test.ts`
- Modify: `tests/lib/chat-service.test.ts`
- Modify: `tests/lib/knowledge-search.test.ts`
- Modify: `tests/lib/embedding.test.ts`

**Step 1: Write the failing tests**

Add a pure flag helper test instead of relying on global env mutation:

```ts
it('reads semantic retrieval enablement from a pure env object', () => {
  expect(isSemanticRetrievalEnabled({ ENABLE_SEMANTIC_RETRIEVAL: 'true' })).toBe(true);
  expect(isSemanticRetrievalEnabled({ ENABLE_SEMANTIC_RETRIEVAL: 'false' })).toBe(false);
  expect(isSemanticRetrievalEnabled({})).toBe(false);
});
```

Add a service-level test that injects the flag decision:

```ts
it('skips semantic retrieval when the flag helper returns false', async () => {
  const service = createChatService({
    loadContext,
    resolveModel,
    searchKnowledge: searchKnowledgeMock,
    semanticRetrievalEnabled: () => false,
  });

  await service.respond({
    context: { routeType: 'planet', starId: 'tech', planetId: 'p_garden' },
    message: '总结当前星球内容',
  });

  expect(searchKnowledgeMock).not.toHaveBeenCalled();
});
```

Add an embedding test for document embeddings:

```ts
it('creates retrieval-document embeddings for content indexing', async () => {
  const embedding = await embedDocument('section text');
  expect(embedding).toHaveLength(1536);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/semantic-retrieval.test.ts tests/lib/chat-service.test.ts tests/lib/knowledge-search.test.ts tests/lib/embedding.test.ts`

Expected: FAIL because retrieval is always attempted for non-node content-understanding prompts, `embedDocument` does not exist, and there is no pure flag helper.

**Step 3: Write minimal implementation**

Add a pure helper module:

```ts
export function isSemanticRetrievalEnabled(env: Record<string, string | undefined>) {
  return env.ENABLE_SEMANTIC_RETRIEVAL?.trim().toLowerCase() === 'true';
}
```

Short-circuit in `chat-service` before calling `searchKnowledgeWithTimeout()`. Inject the decision into `createChatService()` so most tests do not need to mutate `process.env`.

Also split embedding helpers:

```ts
export async function embedQuery(query: string) {
  return embedText(query, 'RETRIEVAL_QUERY');
}

export async function embedDocument(text: string) {
  return embedText(text, 'RETRIEVAL_DOCUMENT');
}
```

Reserve direct `process.env` mutation for env-reader tests only. Do not let new feature-flag tests depend on shared global process state.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/semantic-retrieval.test.ts tests/lib/chat-service.test.ts tests/lib/knowledge-search.test.ts tests/lib/embedding.test.ts`

Expected: PASS and Phase 2A can ship with `ENABLE_SEMANTIC_RETRIEVAL=false`.

**Step 5: Commit**

```bash
git add src/lib/agent/semantic-retrieval.ts src/lib/agent/chat-service.ts src/lib/agent/knowledge-search.ts src/lib/ai/embedding.ts .env.example src/env.d.ts tests/lib/semantic-retrieval.test.ts tests/lib/chat-service.test.ts tests/lib/knowledge-search.test.ts tests/lib/embedding.test.ts
git commit -m "feat(agent): gate semantic retrieval behind an explicit runtime flag"
```

## Task 6: Build a one-shot Markdown -> nodes sync with canonical content-hash upserts

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Create: `src/lib/content-sync/hash.ts`
- Create: `src/lib/content-sync/markdown-source.ts`
- Create: `src/lib/content-sync/nodes-sync.ts`
- Create: `tests/lib/content-sync-hash.test.ts`
- Create: `tests/lib/content-sync-markdown-source.test.ts`
- Create: `tests/lib/content-sync-nodes-sync.test.ts`
- Create: `scripts/sync-garden-index.ts`

**Step 1: Write the failing tests**

Lock the canonical hash contract:

```ts
it('creates a stable content hash from canonicalized frontmatter plus markdown body', () => {
  const left = createContentHash({
    body: '# Title\r\n\r\nBody\r\n',
    frontmatter: {
      starId: 'tech',
      planetId: 'p_garden',
      title: 'Title',
      tags: ['B', 'A'],
    },
  });

  const right = createContentHash({
    body: '# Title\n\nBody',
    frontmatter: {
      title: 'Title',
      planetId: 'p_garden',
      starId: 'tech',
      tags: ['A', 'B'],
      updatedAt: 'ignore-me',
    },
  });

  expect(left).toBe(right);
});
```

Keep the sync test idempotent:

```ts
it('upserts nodes with content_hash and markdown payload', async () => {
  await syncNodesToSupabase({ sourceNodes, supabase });

  expect(upsertMock).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        star_id: 'tech',
        planet_id: 'p_garden',
        slug: 'why-3d-galaxy',
        content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]),
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/content-sync-hash.test.ts tests/lib/content-sync-markdown-source.test.ts tests/lib/content-sync-nodes-sync.test.ts`

Expected: FAIL because the sync modules and script do not exist.

**Step 3: Write minimal implementation**

Use a one-shot script with plain file-system reads instead of trying to run `astro:content` inside a bare Node process. Keep it simple and operator-only:

```ts
export async function loadMarkdownSourceNodes(rootDir = 'src/content/nodes') {
  // recursively read *.md/*.mdx
  // parse frontmatter
  // return normalized records for Supabase sync
}
```

Define canonical hashing explicitly:

- body: normalize CRLF to LF, trim outer blank lines, preserve inner content
- frontmatter: only include stable content fields
- frontmatter keys: sort keys before serialization
- tag arrays: sort before serialization
- derived or operational fields such as `updatedAt` must be excluded

```ts
const HASH_FIELDS = ['title', 'starId', 'planetId', 'summary', 'tags', 'publishedAt', 'heroImage'] as const;
```

```ts
export async function syncNodesToSupabase(input: {
  sourceNodes: SourceNode[];
  supabase: ReturnType<typeof createServerSupabaseClient>;
}) {
  await input.supabase.from('nodes').upsert(
    input.sourceNodes.map((node) => ({
      star_id: node.starId,
      planet_id: node.planetId,
      slug: node.slug,
      title: node.title,
      summary: node.summary,
      tags: node.tags,
      published_at: node.publishedAt,
      hero_image: node.heroImage,
      content_raw: node.body,
      content_hash: node.contentHash,
    })),
    { onConflict: 'star_id,planet_id,slug' },
  );
}
```

`scripts/sync-garden-index.ts` should:

1. load source Markdown
2. create a service-role Supabase client
3. sync `nodes`
4. print a concise summary of inserted or updated rows

Do not import this script from runtime code. It is only for local operator use or CI jobs.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/content-sync-hash.test.ts tests/lib/content-sync-markdown-source.test.ts tests/lib/content-sync-nodes-sync.test.ts`

Expected: PASS

Run: `npm run sync:garden:index -- --dry-run`

Expected: PASS and a summary such as `3 nodes scanned, 3 nodes ready to upsert`.

**Step 5: Commit**

```bash
git add package.json .env.example src/lib/content-sync/hash.ts src/lib/content-sync/markdown-source.ts src/lib/content-sync/nodes-sync.ts tests/lib/content-sync-hash.test.ts tests/lib/content-sync-markdown-source.test.ts tests/lib/content-sync-nodes-sync.test.ts scripts/sync-garden-index.ts
git commit -m "feat(sync): add markdown to nodes backfill with canonical content hashes"
```

## Task 7: Add chunking and transactional embedding backfill for node_embeddings

**Files:**
- Modify: `src/lib/ai/embedding.ts`
- Create: `src/lib/content-sync/chunk-markdown.ts`
- Create: `src/lib/content-sync/embeddings-sync.ts`
- Modify: `scripts/sync-garden-index.ts`
- Create: `supabase/migrations/20260311120000_add_replace_node_embeddings_rpc.sql`
- Modify: `tests/lib/embedding.test.ts`
- Create: `tests/lib/content-sync-chunk-markdown.test.ts`
- Create: `tests/lib/content-sync-embeddings-sync.test.ts`
- Modify: `README.md`
- Modify: `docs/reference/database-architecture.md`

**Step 1: Write the failing tests**

Chunking should be deterministic and bounded:

```ts
it('chunks markdown into ordered retrieval passages', () => {
  const chunks = chunkMarkdownDocument(longMarkdown, { maxChars: 900 });

  expect(chunks[0]).toMatchObject({
    chunkIndex: 0,
    content: expect.stringContaining('为什么我选择 3D 星系'),
  });
  expect(chunks.length).toBeGreaterThan(1);
});
```

Backfill should stage embeddings first and only swap rows transactionally:

```ts
it('replaces node embeddings through a single rpc after all chunk embeddings are ready', async () => {
  await syncNodeEmbeddings({
    changedNodes: [
      { id: 'node-1', contentHash: 'hash-1', contentRaw: '# Title\n\nBody' },
    ],
    embedDocument,
    supabase,
  });

  expect(rpcMock).toHaveBeenCalledWith(
    'replace_node_embeddings_for_node',
    expect.objectContaining({
      target_node_id: 'node-1',
      expected_content_hash: 'hash-1',
    }),
  );
});

it('does not replace existing rows if embedding generation fails before the rpc swap', async () => {
  embedDocumentMock.mockRejectedValueOnce(new Error('rate limited'));

  await expect(syncNodeEmbeddings(input)).rejects.toThrow('rate limited');
  expect(rpcMock).not.toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/embedding.test.ts tests/lib/content-sync-chunk-markdown.test.ts tests/lib/content-sync-embeddings-sync.test.ts`

Expected: FAIL because document chunking, transactional replace, and backfill sync do not exist.

**Step 3: Write minimal implementation**

Chunk markdown by headings and paragraph groups first, not by token-guessing alone:

```ts
export function chunkMarkdownDocument(markdown: string, options = { maxChars: 900 }) {
  // split on headings
  // merge short adjacent blocks
  // return [{ chunkIndex, content }]
}
```

Compute all embeddings in memory first. Only after every chunk is embedded successfully should the script call a database-side transactional replace RPC:

```ts
const preparedRows = await Promise.all(
  chunks.map(async (chunk) => ({
    chunk_index: chunk.chunkIndex,
    content_chunk: chunk.content,
    embedding: await embedDocument(chunk.content),
    embedding_model: readEmbeddingConfig().model,
    chunk_token_count: approximateTokenCount(chunk.content),
  })),
);

await supabase.rpc('replace_node_embeddings_for_node', {
  target_node_id: node.id,
  expected_content_hash: node.contentHash,
  rows: preparedRows,
});
```

Add a migration that wraps delete and insert in one database transaction:

```sql
create or replace function public.replace_node_embeddings_for_node(
  target_node_id uuid,
  expected_content_hash text,
  rows jsonb
)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1
    from public.nodes
    where id = target_node_id
      and content_hash = expected_content_hash
  ) then
    raise exception 'content_hash mismatch for node %', target_node_id;
  end if;

  delete from public.node_embeddings
  where node_id = target_node_id;

  insert into public.node_embeddings (
    node_id,
    chunk_index,
    content_chunk,
    embedding,
    embedding_model,
    chunk_token_count
  )
  select
    target_node_id,
    row.chunk_index,
    row.content_chunk,
    row.embedding::extensions.vector(1536),
    row.embedding_model,
    row.chunk_token_count
  from jsonb_to_recordset(rows) as row(
    chunk_index integer,
    content_chunk text,
    embedding jsonb,
    embedding_model text,
    chunk_token_count integer
  );
end;
$$;
```

Revoke public access to the RPC and grant execute only to `service_role`.

Extend `scripts/sync-garden-index.ts` with:

- `--with-embeddings`
- `--changed-only`
- summary output: scanned / changed / embedded chunks / skipped

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/lib/embedding.test.ts tests/lib/content-sync-chunk-markdown.test.ts tests/lib/content-sync-embeddings-sync.test.ts`

Expected: PASS

Run: `supabase db push`

Expected: PASS and `replace_node_embeddings_for_node` is available.

Run: `npm run sync:garden:index -- --with-embeddings`

Expected: PASS and `node_embeddings` is no longer empty.

**Step 5: Commit**

```bash
git add src/lib/ai/embedding.ts src/lib/content-sync/chunk-markdown.ts src/lib/content-sync/embeddings-sync.ts scripts/sync-garden-index.ts supabase/migrations/20260311120000_add_replace_node_embeddings_rpc.sql tests/lib/embedding.test.ts tests/lib/content-sync-chunk-markdown.test.ts tests/lib/content-sync-embeddings-sync.test.ts README.md docs/reference/database-architecture.md
git commit -m "feat(sync): add transactional embedding backfill for node embeddings"
```

## Task 8: Add a lightweight retrieval quality gate before enablement

**Files:**
- Create: `docs/qa/2026-03-11-retrieval-quality-checklist.md`
- Modify: `README.md`

**Step 1: Write the quality checklist**

Create a small eval set with 8 to 12 prompts that cover:

- current-page summary
- current-planet summary
- whole-garden overview
- first-visit onboarding
- theme recap
- related-node recall
- recent updates
- relationship or key-node explanation

Include pass or fail rules for each prompt:

- retrieval must not widen the scope incorrectly
- retrieval must not invent nonexistent planets or articles
- retrieval may enrich but must not replace deterministic local context
- navigation remains deterministic and local

**Step 2: Run the baseline with retrieval disabled**

Run: `npm run dev`

Expected: the checklist can be completed with `ENABLE_SEMANTIC_RETRIEVAL=false` and captured as the baseline.

**Step 3: Run the same checklist after backfill with retrieval enabled**

Run: `npm run dev`

Expected: the same prompt set can be repeated with `ENABLE_SEMANTIC_RETRIEVAL=true`.

**Step 4: Record the quality gate outcome**

Write a short result block in the checklist:

- prompts that improved
- prompts that stayed equivalent
- prompts that regressed and must block enablement

Do not flip the retrieval flag globally if any prompt regresses on scope, factuality, or article existence.

**Step 5: Commit**

```bash
git add docs/qa/2026-03-11-retrieval-quality-checklist.md README.md
git commit -m "docs(qa): add retrieval quality gate before semantic enablement"
```

## Task 9: Turn vector retrieval on only after backfill and quality checks pass

**Files:**
- Modify: `tests/lib/knowledge-search.test.ts`
- Modify: `tests/lib/chat-service.test.ts`
- Modify: `README.md`
- Modify: `src/content/nodes/tech/p_garden/digital-garden-assistant-architecture-retrospective.md`

**Step 1: Write the failing tests**

Add one enabled-path regression without depending on direct `process.env` mutation in the service test:

```ts
it('uses semantic retrieval when explicitly enabled', async () => {
  const service = createChatService({
    loadContext,
    resolveModel,
    searchKnowledge: searchKnowledgeMock,
    semanticRetrievalEnabled: () => true,
  });

  await service.respond({
    context: { routeType: 'planet', starId: 'tech', planetId: 'p_garden' },
    message: '总结当前星球内容',
  });

  expect(searchKnowledgeMock).toHaveBeenCalledWith({
    context: { routeType: 'planet', starId: 'tech', planetId: 'p_garden' },
    query: '总结当前星球内容',
  });
});
```

Update the retrospective checklist to reflect the actual state once the slice is green:

```md
- `[x]` 构建花园总览能力，回答“这个花园主要有哪些内容”
- `[x]` 面向第一次进入的人提供导览式介绍
```

Only flip those boxes after the tests, manual checks, and retrieval quality gate pass.

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/lib/knowledge-search.test.ts tests/lib/chat-service.test.ts`

Expected: FAIL if the enabled path or documentation is incomplete.

**Step 3: Write minimal implementation**

No large runtime change should be needed here beyond any cleanup from earlier tasks. Focus on:

- enabled-path tests
- docs for when to flip `ENABLE_SEMANTIC_RETRIEVAL=true`
- retrospective status update only after verification

**Step 4: Run the focused validation set**

Run: `npm run test -- tests/lib/agent-context-loader.test.ts tests/lib/content-intent.test.ts tests/lib/semantic-retrieval.test.ts tests/lib/chat-service.test.ts tests/lib/knowledge-search.test.ts tests/lib/agent-api.test.ts`

Expected: PASS

Run: `npm run test:e2e -- tests/e2e/mvp-smoke.spec.ts`

Expected: PASS

Run: `npm run check`

Expected: PASS

Run: `npm run build`

Expected: PASS

Also confirm the Task 8 quality checklist is green before enabling retrieval outside local verification.

**Step 5: Commit**

```bash
git add tests/lib/knowledge-search.test.ts tests/lib/chat-service.test.ts README.md src/content/nodes/tech/p_garden/digital-garden-assistant-architecture-retrospective.md
git commit -m "test(agent): finalize phase 2 and enable vector-ready retrieval path"
```

## Delivery notes

- **Schema readiness gate:** Task 0
- **Phase 2A completion gate:** Tasks 1-4
- **Feature-flag gate:** Task 5
- **Canonical nodes sync:** Task 6
- **Transactional backfill:** Task 7
- **Retrieval quality gate:** Task 8
- **Vector enablement gate:** Task 9

## Exit criteria

Phase 2 should not be called complete until all of the following are true:

- the schema readiness gate passed on the target Supabase environment
- `总结当前页面` works in node scope
- `总结当前星球内容` works in planet scope
- `这个花园主要有哪些内容` works in hub scope
- `我是第一次来，怎么逛比较合适` works in hub scope
- read-page whole-garden questions do not collapse to current-article summaries
- `assistant_events` shows `content_understanding` and `onboarding` in real traffic

Vector retrieval should not be enabled until all of the following are true:

- `ENABLE_SEMANTIC_RETRIEVAL=true` is the only switch that turns it on
- `nodes.content_hash` is populated by the sync step
- `node_embeddings` row count is greater than 0
- one backfill run completes cleanly
- the transactional replace RPC is in place and used by the backfill
- the retrieval quality checklist passed on the representative prompt set
- `tests/lib/knowledge-search.test.ts` and `tests/lib/chat-service.test.ts` pass with retrieval enabled
- sync and backfill remain offline operator or CI jobs only, not runtime behavior
