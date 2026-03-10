import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({
  insert: insertMock,
}));
const createServerSupabaseClientMock = vi.fn(() => ({
  from: fromMock,
}));

vi.mock('../../src/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

async function loadAssistantEventsModule() {
  vi.resetModules();
  return import('../../src/lib/observability/assistant-events');
}

describe('recordAssistantEvent', () => {
  beforeEach(() => {
    vi.resetModules();
    insertMock.mockReset();
    fromMock.mockClear();
    createServerSupabaseClientMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
  });

  it('records assistant events with scope and latency metadata', async () => {
    const { recordAssistantEvent } = await loadAssistantEventsModule();

    await recordAssistantEvent({
      actionTargetId: null,
      actionType: null,
      interactionIntent: 'content_understanding',
      latencyMs: 320,
      message: '总结当前页面',
      planetId: 'p_garden',
      routeType: 'node',
      slug: 'why-3d-galaxy',
      starId: 'tech',
      success: true,
    });

    expect(createServerSupabaseClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('assistant_events');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        interaction_intent: 'content_understanding',
        latency_ms: 320,
        planet_id: 'p_garden',
        route_type: 'node',
        slug: 'why-3d-galaxy',
        star_id: 'tech',
        success: true,
      }),
    );
  });

  it('throws when Supabase returns an insert error', async () => {
    insertMock.mockResolvedValue({
      error: new Error('insert failed'),
    });

    const { recordAssistantEvent } = await loadAssistantEventsModule();

    await expect(
      recordAssistantEvent({
        interactionIntent: 'general_chat',
        latencyMs: 25,
        message: '介绍一下这个网站',
        routeType: 'hub',
        success: true,
      }),
    ).rejects.toThrow('insert failed');
  });
});
