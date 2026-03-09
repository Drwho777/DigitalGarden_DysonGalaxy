import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyAgentError,
  extractUpstreamStatus,
  logAgentError,
} from '../../src/lib/observability/agent-log';

describe('agent-log', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts upstream status codes from nested errors', () => {
    expect(
      extractUpstreamStatus({
        cause: {
          response: {
            status: 429,
          },
        },
      }),
    ).toBe(429);
  });

  it('classifies bad request failures from message text', () => {
    expect(
      classifyAgentError(
        new Error("Failed after 2 attempts with non-retryable error: 'Bad Request'"),
      ),
    ).toBe('upstream_bad_request');
  });

  it('redacts secrets and account ids from logged error messages', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    logAgentError(
      new Error(
        'Bearer secret-token authorization=abc123 token=xyz accounts/1234567890abcdef',
      ),
      {
        model: '@cf/zai-org/glm-4.7-flash',
        provider: 'cloudflare',
        requestId: 'req-log-1',
        status: 500,
      },
    );

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('"event":"agent.error"');
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('"provider":"cloudflare"');
    expect(consoleErrorSpy.mock.calls[0][0]).not.toContain('secret-token');
    expect(consoleErrorSpy.mock.calls[0][0]).not.toContain('abc123');
    expect(consoleErrorSpy.mock.calls[0][0]).not.toContain('1234567890abcdef');
  });
});
