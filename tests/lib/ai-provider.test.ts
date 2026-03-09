import { describe, expect, it } from 'vitest';
import type { generateText } from 'ai';
import {
  CLOUDFLARE_OPENAI_COMPAT_BASE_URL,
  createLanguageModel,
} from '../../src/lib/ai/provider';

describe('createLanguageModel', () => {
  it('returns a generateText-compatible google model', () => {
    const model = createLanguageModel({
      apiKey: 'google-key',
      model: 'gemini-2.5-flash',
      provider: 'google',
    });

    const compatibleModel: Parameters<typeof generateText>[0]['model'] = model;

    expect(compatibleModel).toBe(model);
  });

  it('returns a generateText-compatible cloudflare model', () => {
    const model = createLanguageModel({
      accountId: 'account-123',
      apiKey: 'cloudflare-key',
      model: '@cf/meta/llama-3.1-8b-instruct',
      provider: 'cloudflare',
    });

    const compatibleModel: Parameters<typeof generateText>[0]['model'] = model;

    expect(compatibleModel).toBe(model);
  });

  it('builds the expected Cloudflare OpenAI-compatible base URL', () => {
    expect(CLOUDFLARE_OPENAI_COMPAT_BASE_URL('account-123')).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-123/ai/v1',
    );
  });
});
