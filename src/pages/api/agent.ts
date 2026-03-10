export const prerender = false;

import type { APIRoute } from 'astro';
import { agentService } from '../../lib/agent/service';
import { readAIConfigSummary } from '../../lib/ai/config';
import { resolveInteractionIntent } from '../../lib/agent/content-intent';
import { shouldRequireTeleportTool } from '../../lib/agent/service';
import { recordAssistantEvent } from '../../lib/observability/assistant-events';
import {
  createAgentRequestId,
  logAgentError,
  logAgentRequest,
  logAgentResponse,
} from '../../lib/observability/agent-log';
import {
  isValidAgentRequestContext,
  normalizeAgentRequestContext,
  type AgentRequestContextInput,
} from '../../types/agent-context';
import {
  getAgentActionTarget,
  getAgentActionType,
  type AgentResponse,
} from '../../types/agent';

const UNEXPECTED_AGENT_ERROR_MESSAGE =
  '[agent unavailable] failed to reach the Dyson command relay.';

interface InvalidAgentRequestResult {
  ok: false;
  response: AgentResponse;
  status: 400 | 422;
}

interface ValidAgentRequestResult {
  context?: AgentRequestContextInput;
  message: string;
  ok: true;
}

type AgentRequestResult = InvalidAgentRequestResult | ValidAgentRequestResult;

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
    return parts.join(' ');
  }

  return directValue ?? String(error);
}

async function recordAssistantEventSafely(input: {
  actionTargetId?: string | null;
  actionType?: string | null;
  context?: AgentRequestContextInput;
  interactionIntent: ReturnType<typeof resolveInteractionIntent>;
  latencyMs: number;
  message: string;
  success: boolean;
}) {
  try {
    await recordAssistantEvent({
      actionTargetId: input.actionTargetId ?? null,
      actionType: input.actionType ?? null,
      interactionIntent: input.interactionIntent,
      latencyMs: input.latencyMs,
      message: input.message,
      planetId:
        input.context?.routeType === 'hub' ? null : input.context?.planetId ?? null,
      routeType: input.context?.routeType ?? 'hub',
      slug: input.context?.routeType === 'node' ? input.context.slug : null,
      starId:
        input.context?.routeType === 'hub' ? null : input.context?.starId ?? null,
      success: input.success,
    });
  } catch (error) {
    console.error(
      '[assistant events unavailable]',
      formatAssistantEventError(error),
    );
  }
}

function jsonResponse(payload: AgentResponse, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function createErrorResult(
  status: 400 | 422,
  message: string,
): InvalidAgentRequestResult {
  return {
    ok: false,
    status,
    response: {
      message,
      action: null,
    },
  };
}

async function parseAgentRequest(request: Request): Promise<AgentRequestResult> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createErrorResult(400, 'Invalid JSON request body.');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return createErrorResult(422, 'Request body must be a JSON object.');
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'message')) {
    return createErrorResult(422, '`message` is required.');
  }

  const { context, message } = body as {
    context?: unknown;
    message?: unknown;
  };
  if (typeof message !== 'string') {
    return createErrorResult(422, '`message` must be a string.');
  }

  if (
    context !== undefined &&
    !isValidAgentRequestContext(context)
  ) {
    return createErrorResult(422, '`context` is invalid.');
  }

  return {
    context:
      context === undefined
        ? undefined
        : normalizeAgentRequestContext(context),
    ok: true,
    message,
  };
}

export const POST: APIRoute = async ({ request }) => {
  const requestId = createAgentRequestId();
  const startedAt = Date.now();
  const configSummary = (() => {
    try {
      return readAIConfigSummary();
    } catch {
      return {
        model: undefined,
        provider: undefined,
      };
    }
  })();
  const parsedRequest = await parseAgentRequest(request);
  if (!parsedRequest.ok) {
    logAgentResponse({
      isNavigationIntent: false,
      latencyMs: Date.now() - startedAt,
      messageLength: 0,
      model: configSummary.model,
      provider: configSummary.provider,
      requestId,
      status: parsedRequest.status,
    });

    return jsonResponse(parsedRequest.response, parsedRequest.status);
  }

  const normalizedMessage = parsedRequest.message.trim();
  const isNavigationIntent = shouldRequireTeleportTool(normalizedMessage);
  const interactionIntent = resolveInteractionIntent(normalizedMessage);

  logAgentRequest({
    isNavigationIntent,
    messageLength: normalizedMessage.length,
    model: configSummary.model,
    provider: configSummary.provider,
    requestId,
  });

  try {
    const result = await agentService.respond({
      ...(parsedRequest.context ? { context: parsedRequest.context } : {}),
      message: parsedRequest.message,
      requestId,
    });
    const latencyMs = Date.now() - startedAt;

    logAgentResponse({
      actionTargetId:
        getAgentActionTarget(result.response.action) ?? undefined,
      actionType: getAgentActionType(result.response.action) ?? undefined,
      isNavigationIntent,
      latencyMs,
      messageLength: normalizedMessage.length,
      model: configSummary.model,
      provider: configSummary.provider,
      requestId,
      status: result.status,
    });

    void recordAssistantEventSafely({
      actionTargetId: getAgentActionTarget(result.response.action),
      actionType: getAgentActionType(result.response.action),
      context: parsedRequest.context,
      interactionIntent,
      latencyMs,
      message: normalizedMessage,
      success: result.status >= 200 && result.status < 300,
    });

    return jsonResponse(result.response, result.status);
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    logAgentError(error, {
      latencyMs,
      model: configSummary.model,
      provider: configSummary.provider,
      requestId,
      status: 500,
    });

    logAgentResponse({
      isNavigationIntent,
      latencyMs,
      messageLength: normalizedMessage.length,
      model: configSummary.model,
      provider: configSummary.provider,
      requestId,
      status: 500,
    });

    void recordAssistantEventSafely({
      context: parsedRequest.context,
      interactionIntent,
      latencyMs,
      message: normalizedMessage,
      success: false,
    });

    return jsonResponse(
      {
        action: null,
        message: UNEXPECTED_AGENT_ERROR_MESSAGE,
      },
      500,
    );
  }
};
