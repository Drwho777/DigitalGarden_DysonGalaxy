import { describe, expect, it } from 'vitest';
import {
  isRetryableRemoteError,
  pollSupabaseQueryUntilMatch,
  retryRemoteOperation,
} from '../integration/assistant-events.remote.helpers.mjs';

describe('assistant-events remote helpers', () => {
  it('treats transient network errors as retryable', () => {
    expect(
      isRetryableRemoteError({
        details:
          'ConnectTimeoutError: Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)',
        message: 'TypeError: fetch failed',
      }),
    ).toBe(true);
  });

  it('does not treat query permission errors as retryable', () => {
    expect(
      isRetryableRemoteError({
        code: '42501',
        message: 'permission denied for table assistant_events',
      }),
    ).toBe(false);
  });

  it('retries transient errors until a matching row is found', async () => {
    let attempt = 0;

    const result = await pollSupabaseQueryUntilMatch({
      buildQuery: async () => {
        attempt += 1;

        if (attempt === 1) {
          return {
            data: null,
            error: {
              details:
                'ConnectTimeoutError: Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)',
              message: 'TypeError: fetch failed',
            },
          };
        }

        return {
          data: [
            {
              action_target_id: 'p_garden',
            },
          ],
          error: null,
        };
      },
      emptyResultMessage: 'row not found',
      pollIntervalMs: 0,
      requestTimeoutMs: 100,
      timeoutMessage: 'query timed out',
      timeoutMs: 1000,
    });

    expect(attempt).toBe(2);
    expect(result.error).toBeNull();
    expect(result.row).toEqual({
      action_target_id: 'p_garden',
    });
  });

  it('returns non-retryable query errors immediately', async () => {
    const result = await pollSupabaseQueryUntilMatch({
      buildQuery: async () => ({
        data: null,
        error: {
          code: '42501',
          message: 'permission denied for table assistant_events',
        },
      }),
      emptyResultMessage: 'row not found',
      pollIntervalMs: 0,
      requestTimeoutMs: 100,
      timeoutMessage: 'query timed out',
      timeoutMs: 1000,
    });

    expect(result.row).toBeNull();
    expect(result.error).toEqual({
      code: '42501',
      message: 'permission denied for table assistant_events',
    });
  });

  it('retries transient request failures until the operation succeeds', async () => {
    let attempt = 0;

    const result = await retryRemoteOperation({
      execute: async () => {
        attempt += 1;

        if (attempt === 1) {
          throw new Error('fetch failed');
        }

        return {
          ok: true,
        };
      },
      retryIntervalMs: 0,
      timeoutMessage: 'request failed',
      timeoutMs: 1000,
    });

    expect(attempt).toBe(2);
    expect(result).toEqual({
      ok: true,
    });
  });
});
