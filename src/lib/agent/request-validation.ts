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

export type AgentRequestResult =
  | InvalidAgentRequestResult
  | ValidAgentRequestResult;

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

export async function parseAgentRequest(
  request: Request,
): Promise<AgentRequestResult> {
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
