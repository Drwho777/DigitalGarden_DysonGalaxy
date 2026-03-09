import type { LanguageModel } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { resolveAIConfig, type AIProviderConfig } from './config';

export interface ResolvedLanguageModel {
  config: AIProviderConfig;
  model: LanguageModel;
}

export const CLOUDFLARE_OPENAI_COMPAT_BASE_URL = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;

function createGoogleLanguageModel(config: Extract<AIProviderConfig, { provider: 'google' }>) {
  return createGoogleGenerativeAI({
    apiKey: config.apiKey,
  })(config.model);
}

function createCloudflareLanguageModel(
  config: Extract<AIProviderConfig, { provider: 'cloudflare' }>,
) {
  return createOpenAICompatible({
    apiKey: config.apiKey,
    baseURL: CLOUDFLARE_OPENAI_COMPAT_BASE_URL(config.accountId),
    name: 'cloudflare',
  })(config.model);
}

export function createLanguageModel(
  config: AIProviderConfig = resolveAIConfig(),
): LanguageModel {
  if (config.provider === 'google') {
    return createGoogleLanguageModel(config);
  }

  return createCloudflareLanguageModel(config);
}

export function resolveLanguageModel(): LanguageModel {
  return createLanguageModel(resolveAIConfig());
}

export function resolveLanguageModelContext(): ResolvedLanguageModel {
  const config = resolveAIConfig();

  return {
    config,
    model: createLanguageModel(config),
  };
}
