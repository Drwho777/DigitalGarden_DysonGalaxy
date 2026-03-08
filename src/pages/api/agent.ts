import type { APIRoute } from 'astro';
import { agentService } from '../../lib/agent/service';
import type { AgentResponse } from '../../types/agent';

export const prerender = false;

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
  const parsedRequest = await parseAgentRequest(request);
  if (!parsedRequest.ok) {
    return jsonResponse(parsedRequest.response, parsedRequest.status);
  }

  const result = await agentService.respond({
    message: parsedRequest.message,
  });

  return jsonResponse(result.response, result.status);
};
