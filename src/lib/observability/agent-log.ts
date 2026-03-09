import { AIConfigError } from '../ai/config';

export type AgentErrorKind =
  | 'config_error'
  | 'upstream_bad_request'
  | 'upstream_auth'
  | 'upstream_rate_limit'
  | 'upstream_server_error'
  | 'unknown_error';

interface AgentLogBase {
  event: 'agent.request' | 'agent.response' | 'agent.error';
  path: '/api/agent';
  requestId: string;
}

export interface AgentRequestLog extends AgentLogBase {
  event: 'agent.request';
  isNavigationIntent: boolean;
  messageLength: number;
  model?: string;
  provider?: string;
}

export interface AgentResponseLog extends AgentLogBase {
  event: 'agent.response';
  actionTargetId?: string;
  actionType?: string;
  isNavigationIntent: boolean;
  latencyMs: number;
  messageLength: number;
  model?: string;
  provider?: string;
  status: number;
}

export interface AgentErrorLog extends AgentLogBase {
  event: 'agent.error';
  errorKind: AgentErrorKind;
  errorMessage?: string;
  errorName?: string;
  latencyMs?: number;
  model?: string;
  provider?: string;
  status: number;
  upstreamStatus?: number;
}

type AgentLogPayload = AgentRequestLog | AgentResponseLog | AgentErrorLog;

const LOG_PATH = '/api/agent';

function sanitizeErrorMessage(message: string) {
  return message
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

function getNumericStatus(value: unknown) {
  return typeof value === 'number' && value >= 100 && value <= 599
    ? value
    : undefined;
}

export function extractUpstreamStatus(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidates = [
    error as Record<string, unknown>,
    (error as { cause?: Record<string, unknown> }).cause,
    (error as { response?: Record<string, unknown> }).response,
    (error as { cause?: { response?: Record<string, unknown> } }).cause
      ?.response,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const status =
      getNumericStatus(candidate.statusCode) ?? getNumericStatus(candidate.status);

    if (status) {
      return status;
    }
  }

  return undefined;
}

export function classifyAgentError(error: unknown): AgentErrorKind {
  if (
    error instanceof AIConfigError ||
    (error instanceof Error && error.name === 'AIConfigError')
  ) {
    return 'config_error';
  }

  const upstreamStatus = extractUpstreamStatus(error);
  if (upstreamStatus === 400) {
    return 'upstream_bad_request';
  }

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return 'upstream_auth';
  }

  if (upstreamStatus === 429) {
    return 'upstream_rate_limit';
  }

  if (upstreamStatus && upstreamStatus >= 500) {
    return 'upstream_server_error';
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('bad request')) {
    return 'upstream_bad_request';
  }

  if (
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('authentication')
  ) {
    return 'upstream_auth';
  }

  if (message.includes('rate limit') || message.includes('429')) {
    return 'upstream_rate_limit';
  }

  return 'unknown_error';
}

function writeLog(level: 'info' | 'error', payload: AgentLogPayload) {
  const serialized = JSON.stringify(payload);
  if (level === 'error') {
    console.error(serialized);
    return;
  }

  console.info(serialized);
}

export function createAgentRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `agent-${Date.now()}`;
}

export function logAgentRequest(
  payload: Omit<AgentRequestLog, 'event' | 'path'>,
) {
  writeLog('info', {
    ...payload,
    event: 'agent.request',
    path: LOG_PATH,
  });
}

export function logAgentResponse(
  payload: Omit<AgentResponseLog, 'event' | 'path'>,
) {
  writeLog('info', {
    ...payload,
    event: 'agent.response',
    path: LOG_PATH,
  });
}

export function logAgentError(
  error: unknown,
  payload: Omit<
    AgentErrorLog,
    'errorKind' | 'errorMessage' | 'errorName' | 'event' | 'path' | 'upstreamStatus'
  >,
) {
  writeLog('error', {
    ...payload,
    errorKind: classifyAgentError(error),
    errorMessage:
      error instanceof Error ? sanitizeErrorMessage(error.message) : undefined,
    errorName: error instanceof Error ? error.name : undefined,
    event: 'agent.error',
    path: LOG_PATH,
    upstreamStatus: extractUpstreamStatus(error),
  });
}
