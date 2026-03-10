import type { InteractionIntent } from '../agent/content-intent';
import { createServerSupabaseClient } from '../supabase/server';

export interface AssistantEventInput {
  actionTargetId?: string | null;
  actionType?: string | null;
  interactionIntent: InteractionIntent;
  latencyMs: number;
  message: string;
  planetId?: string | null;
  routeType: 'hub' | 'planet' | 'node';
  slug?: string | null;
  starId?: string | null;
  success: boolean;
}

export async function recordAssistantEvent(event: AssistantEventInput) {
  const client = createServerSupabaseClient();
  const { error } = await client.from('assistant_events').insert({
    action_target_id: event.actionTargetId ?? null,
    action_type: event.actionType ?? null,
    interaction_intent: event.interactionIntent,
    latency_ms: event.latencyMs,
    message: event.message,
    planet_id: event.planetId ?? null,
    route_type: event.routeType,
    slug: event.slug ?? null,
    star_id: event.starId ?? null,
    success: event.success,
  });

  if (error) {
    throw error;
  }
}
