export const prerender = false;

import type { APIRoute } from 'astro';
import { agentService } from '../../lib/agent/service';
import { readAIConfigSummary } from '../../lib/ai/config';
import { resolveInteractionIntent } from '../../lib/agent/content-intent';
import { shouldRequireTeleportTool } from '../../lib/agent/service';
import {
  logAssistantEventDbInsertTimedOut,
  recordAssistantEvent,
} from '../../lib/observability/assistant-events';
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

export const ASSISTANT_EVENT_WRITE_TIMEOUT_MS = 1000;

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

class AssistantEventWriteTimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Assistant event write timed out after ${timeoutMs}ms.`);
    this.name = 'AssistantEventWriteTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

async function recordAssistantEventWithTimeout(input: {
  actionTargetId?: string | null;
  actionType?: string | null;
  context?: AgentRequestContextInput;
  interactionIntent: ReturnType<typeof resolveInteractionIntent>;
  latencyMs: number;
  message: string;
  requestId: string;
  success: boolean;
}) {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new AssistantEventWriteTimeoutError(ASSISTANT_EVENT_WRITE_TIMEOUT_MS),
      );
    }, ASSISTANT_EVENT_WRITE_TIMEOUT_MS);
  });

  try {
    await Promise.race([
      recordAssistantEvent({
        actionTargetId: input.actionTargetId ?? null,
        actionType: input.actionType ?? null,
        interactionIntent: input.interactionIntent,
        latencyMs: input.latencyMs,
        message: input.message,
        planetId:
          input.context?.routeType === 'hub'
            ? null
            : input.context?.planetId ?? null,
        requestId: input.requestId,
        routeType: input.context?.routeType ?? 'hub',
        slug: input.context?.routeType === 'node' ? input.context.slug : null,
        starId:
          input.context?.routeType === 'hub' ? null : input.context?.starId ?? null,
        success: input.success,
      }),
      timeoutPromise,
    ]);
  } catch (error) {
    if (error instanceof AssistantEventWriteTimeoutError) {
      logAssistantEventDbInsertTimedOut({
        actionTargetId: input.actionTargetId ?? null,
        actionType: input.actionType ?? null,
        interactionIntent: input.interactionIntent,
        requestId: input.requestId,
        timeoutMs: error.timeoutMs,
      });
    }
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
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

    await recordAssistantEventWithTimeout({
      actionTargetId: getAgentActionTarget(result.response.action),
      actionType: getAgentActionType(result.response.action),
      context: parsedRequest.context,
      interactionIntent,
      latencyMs,
      message: normalizedMessage,
      requestId,
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

    await recordAssistantEventWithTimeout({
      context: parsedRequest.context,
      interactionIntent,
      latencyMs,
      message: normalizedMessage,
      requestId,
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
