export const prerender = false;

import type { APIRoute } from 'astro';
import { agentService } from '../../lib/agent/service';
import { readAIConfigSummary } from '../../lib/ai/config';
import { shouldRequireTeleportTool } from '../../lib/agent/service';
import {
  createAgentRequestId,
  logAgentRequest,
  logAgentResponse,
} from '../../lib/observability/agent-log';
import type { AgentResponse } from '../../types/agent';

interface InvalidAgentRequestResult {
  ok: false;
  response: AgentResponse;
  status: 400 | 422;
}

interface ValidAgentRequestResult {
  message: string;
  ok: true;
}

type AgentRequestResult = InvalidAgentRequestResult | ValidAgentRequestResult;

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

  const { message } = body as { message?: unknown };
  if (typeof message !== 'string') {
    return createErrorResult(422, '`message` must be a string.');
  }

  return {
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

  logAgentRequest({
    isNavigationIntent,
    messageLength: normalizedMessage.length,
    model: configSummary.model,
    provider: configSummary.provider,
    requestId,
  });

  const result = await agentService.respond({
    message: parsedRequest.message,
    requestId,
  });

  logAgentResponse({
    actionTargetId: result.response.action?.targetId,
    actionType: result.response.action?.type,
    isNavigationIntent,
    latencyMs: Date.now() - startedAt,
    messageLength: normalizedMessage.length,
    model: configSummary.model,
    provider: configSummary.provider,
    requestId,
    status: result.status,
  });

  return jsonResponse(result.response, result.status);
};
