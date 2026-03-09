import { describe, expect, it } from 'vitest';
import {
  AIConfigError,
  DEFAULT_GOOGLE_MODEL,
  resolveAIConfig,
  type RuntimeEnv,
} from '../../src/lib/ai/config';

function createEnv(overrides: RuntimeEnv = {}): RuntimeEnv {
  return {
    AI_ACCOUNT_ID: undefined,
    AI_API_KEY: undefined,
    AI_MODEL: undefined,
    AI_PROVIDER: undefined,
    CLOUDFLARE_ACCOUNT_ID: undefined,
    CLOUDFLARE_API_TOKEN: undefined,
    GOOGLE_GENERATIVE_AI_API_KEY: undefined,
    ...overrides,
  };
}

describe('resolveAIConfig', () => {
  it('uses generic google config when provided', () => {
    expect(
      resolveAIConfig(
        createEnv({
          AI_API_KEY: 'google-key',
          AI_MODEL: 'gemini-2.5-pro',
          AI_PROVIDER: 'google',
        }),
      ),
    ).toEqual({
      apiKey: 'google-key',
      model: 'gemini-2.5-pro',
      provider: 'google',
    });
  });

  it('falls back to the legacy google env var and default model', () => {
    expect(
      resolveAIConfig(
        createEnv({
          GOOGLE_GENERATIVE_AI_API_KEY: 'legacy-google-key',
        }),
      ),
    ).toEqual({
      apiKey: 'legacy-google-key',
      model: DEFAULT_GOOGLE_MODEL,
      provider: 'google',
    });
  });

  it('uses generic cloudflare config when provided', () => {
    expect(
      resolveAIConfig(
        createEnv({
          AI_ACCOUNT_ID: 'account-123',
          AI_API_KEY: 'cloudflare-key',
          AI_MODEL: '@cf/meta/llama-3.1-8b-instruct',
          AI_PROVIDER: 'cloudflare',
        }),
      ),
    ).toEqual({
      accountId: 'account-123',
      apiKey: 'cloudflare-key',
      model: '@cf/meta/llama-3.1-8b-instruct',
      provider: 'cloudflare',
    });
  });

  it('falls back to the legacy cloudflare env vars', () => {
    expect(
      resolveAIConfig(
        createEnv({
          AI_MODEL: '@cf/meta/llama-3.1-8b-instruct',
          AI_PROVIDER: 'cloudflare',
          CLOUDFLARE_ACCOUNT_ID: 'legacy-account',
          CLOUDFLARE_API_TOKEN: 'legacy-token',
        }),
      ),
    ).toEqual({
      accountId: 'legacy-account',
      apiKey: 'legacy-token',
      model: '@cf/meta/llama-3.1-8b-instruct',
      provider: 'cloudflare',
    });
  });

  it('throws a readable error when the provider api key is missing', () => {
    expect(() =>
      resolveAIConfig(
        createEnv({
          AI_PROVIDER: 'google',
        }),
      ),
    ).toThrowError(
      new AIConfigError('AI_API_KEY is not configured for provider "google".'),
    );
  });

  it('throws a readable error when the cloudflare account id is missing', () => {
    expect(() =>
      resolveAIConfig(
        createEnv({
          AI_API_KEY: 'cloudflare-key',
          AI_MODEL: '@cf/meta/llama-3.1-8b-instruct',
          AI_PROVIDER: 'cloudflare',
        }),
      ),
    ).toThrowError(
      new AIConfigError(
        'AI_ACCOUNT_ID is not configured for provider "cloudflare".',
      ),
    );
  });
});
