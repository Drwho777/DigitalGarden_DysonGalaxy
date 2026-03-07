import type { APIRoute } from 'astro';
import { parseAgentRequest } from '../../lib/agent/request-validation';
import { ruleBasedAgentService } from '../../lib/agent/runtime-service';
import type { AgentResponse } from '../../types/agent';

export const prerender = false;

function jsonResponse(payload: AgentResponse, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const parsedRequest = await parseAgentRequest(request);
  if (!parsedRequest.ok) {
    return jsonResponse(parsedRequest.response, parsedRequest.status);
  }

  const result = await ruleBasedAgentService.respond({
    message: parsedRequest.message,
  });

  return jsonResponse(result.response, result.status);
};
