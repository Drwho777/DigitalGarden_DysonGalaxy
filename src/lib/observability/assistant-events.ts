import type { InteractionIntent } from '../agent/content-intent';
import { createServerSupabaseClient } from '../supabase/server';

const LOG_PATH = '/api/agent';

export interface AssistantEventInput {
  actionTargetId?: string | null;
  actionType?: string | null;
  interactionIntent: InteractionIntent;
  latencyMs: number;
  message: string;
  planetId?: string | null;
  requestId: string;
  routeType: 'hub' | 'planet' | 'node';
  slug?: string | null;
  starId?: string | null;
  success: boolean;
}

interface AssistantEventLogBase {
  actionTargetId?: string;
  actionType?: string;
  interactionIntent: InteractionIntent;
  path: '/api/agent';
  requestId: string;
}

interface AssistantEventDbInsertStartedLog extends AssistantEventLogBase {
  event: 'assistant_event.db_insert_started';
}

interface AssistantEventDbInsertSucceededLog extends AssistantEventLogBase {
  event: 'assistant_event.db_insert_succeeded';
}

interface AssistantEventDbInsertFailedLog extends AssistantEventLogBase {
  errorSummary?: string;
  event: 'assistant_event.db_insert_failed';
}

interface AssistantEventDbInsertTimedOutLog extends AssistantEventLogBase {
  errorSummary: string;
  event: 'assistant_event.db_insert_timed_out';
  timeoutMs: number;
}

type AssistantEventLogPayload =
  | AssistantEventDbInsertFailedLog
  | AssistantEventDbInsertStartedLog
  | AssistantEventDbInsertSucceededLog
  | AssistantEventDbInsertTimedOutLog;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function stringifyLogValue(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== '{}' ? serialized : undefined;
  } catch {
    return undefined;
  }
}

function collectErrorCandidates(error: unknown) {
  const candidates: Record<string, unknown>[] = [];
  const seen = new Set<object>();

  function addCandidate(value: unknown) {
    if (!isRecord(value) || seen.has(value)) {
      return;
    }

    seen.add(value);
    candidates.push(value);
  }

  addCandidate(error);

  if (error instanceof Error) {
    addCandidate(error.cause);
  }

  if (isRecord(error)) {
    addCandidate(error.cause);
    addCandidate(error.response);
    addCandidate(error.error);

    if (isRecord(error.cause)) {
      addCandidate(error.cause.response);
      addCandidate(error.cause.error);
    }

    if (isRecord(error.response)) {
      addCandidate(error.response.error);
    }
  }

  return candidates;
}

function readErrorField(
  candidates: Record<string, unknown>[],
  keys: string[],
) {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = stringifyLogValue(candidate[key]);
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function sanitizeErrorSummary(summary: string) {
  return summary
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(
      /(api[_-]?key|token|authorization)\s*[:=]\s*[^,\s]+/gi,
      '$1=[redacted]',
    )
    .replace(/accounts\/[^/\s]+/gi, 'accounts/[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function formatAssistantEventError(error: unknown) {
  const directValue = stringifyLogValue(error);
  const candidates = collectErrorCandidates(error);
  const name = readErrorField(candidates, ['name']);
  const message = readErrorField(candidates, ['message']);
  const code = readErrorField(candidates, ['code', 'errorCode']);
  const details = readErrorField(candidates, ['details']);
  const hint = readErrorField(candidates, ['hint']);
  const status = readErrorField(candidates, ['status', 'statusCode']);
  const statusText = readErrorField(candidates, ['statusText']);
  const parts = [
    name && name !== 'Error' ? `name=${name}` : undefined,
    message ? `message=${message}` : undefined,
    code ? `code=${code}` : undefined,
    details ? `details=${details}` : undefined,
    hint ? `hint=${hint}` : undefined,
    status ? `status=${status}` : undefined,
    statusText ? `statusText=${statusText}` : undefined,
  ].filter((part): part is string => Boolean(part));

  if (parts.length > 0) {
    return sanitizeErrorSummary(parts.join(' '));
  }

  return sanitizeErrorSummary(directValue ?? String(error));
}

function createAssistantEventLogContext(event: AssistantEventInput) {
  return {
    actionTargetId: event.actionTargetId ?? undefined,
    actionType: event.actionType ?? undefined,
    interactionIntent: event.interactionIntent,
    requestId: event.requestId,
  };
}

function writeAssistantEventLog(
  level: 'info' | 'error',
  payload: AssistantEventLogPayload,
) {
  const serialized = JSON.stringify(payload);

  if (level === 'error') {
    console.error(serialized);
    return;
  }

  console.info(serialized);
}

function logAssistantEventDbInsertStarted(event: AssistantEventInput) {
  writeAssistantEventLog('info', {
    ...createAssistantEventLogContext(event),
    event: 'assistant_event.db_insert_started',
    path: LOG_PATH,
  });
}

function logAssistantEventDbInsertSucceeded(event: AssistantEventInput) {
  writeAssistantEventLog('info', {
    ...createAssistantEventLogContext(event),
    event: 'assistant_event.db_insert_succeeded',
    path: LOG_PATH,
  });
}

function logAssistantEventDbInsertFailed(
  event: AssistantEventInput,
  error: unknown,
) {
  writeAssistantEventLog('error', {
    ...createAssistantEventLogContext(event),
    errorSummary: formatAssistantEventError(error),
    event: 'assistant_event.db_insert_failed',
    path: LOG_PATH,
  });
}

export function logAssistantEventDbInsertTimedOut(payload: {
  actionTargetId?: string | null;
  actionType?: string | null;
  interactionIntent: InteractionIntent;
  requestId: string;
  timeoutMs: number;
}) {
  writeAssistantEventLog('error', {
    actionTargetId: payload.actionTargetId ?? undefined,
    actionType: payload.actionType ?? undefined,
    errorSummary: `timed out after ${payload.timeoutMs}ms`,
    event: 'assistant_event.db_insert_timed_out',
    interactionIntent: payload.interactionIntent,
    path: LOG_PATH,
    requestId: payload.requestId,
    timeoutMs: payload.timeoutMs,
  });
}

export async function recordAssistantEvent(event: AssistantEventInput) {
  logAssistantEventDbInsertStarted(event);

  try {
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

    logAssistantEventDbInsertSucceeded(event);
  } catch (error) {
    logAssistantEventDbInsertFailed(event, error);
    throw error;
  }
}
