import { embed } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  AIConfigError,
  DEFAULT_AI_PROVIDER,
  readRuntimeEnv,
} from './config';
import { CLOUDFLARE_OPENAI_COMPAT_BASE_URL } from './provider';

const DEFAULT_GOOGLE_EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_VECTOR_DIMENSIONS = 1536;

interface GoogleEmbeddingConfig {
  apiKey: string;
  model: string;
  provider: 'google';
}

interface CloudflareEmbeddingConfig {
  accountId: string;
  apiKey: string;
  model: string;
  provider: 'cloudflare';
}

export type EmbeddingConfig = GoogleEmbeddingConfig | CloudflareEmbeddingConfig;

function normalizeEnvValue(value: string | undefined) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

export function readEmbeddingVectorDimensions(
  env: Record<string, string | undefined> = readRuntimeEnv(),
) {
  const configuredDimensions = normalizeEnvValue(env.EMBEDDING_DIMENSIONS);

  if (!configuredDimensions) {
    return EMBEDDING_VECTOR_DIMENSIONS;
  }

  const parsedDimensions = Number.parseInt(configuredDimensions, 10);
  if (!Number.isInteger(parsedDimensions) || parsedDimensions <= 0) {
    throw new AIConfigError(
      `EMBEDDING_DIMENSIONS must be a positive integer. Received "${configuredDimensions}".`,
    );
  }

  return parsedDimensions;
}

function resolveEmbeddingProvider(
  env: Record<string, string | undefined>,
): EmbeddingConfig['provider'] {
  const configuredProvider = normalizeEnvValue(env.AI_PROVIDER)?.toLowerCase();

  if (!configuredProvider) {
    return DEFAULT_AI_PROVIDER;
  }

  if (configuredProvider === 'google' || configuredProvider === 'cloudflare') {
    return configuredProvider;
  }

  throw new AIConfigError(
    `Unsupported AI_PROVIDER "${configuredProvider}". Expected "google" or "cloudflare".`,
  );
}

function resolveEmbeddingApiKey(
  provider: EmbeddingConfig['provider'],
  env: Record<string, string | undefined>,
) {
  return (
    normalizeEnvValue(env.AI_API_KEY) ??
    (provider === 'google'
      ? normalizeEnvValue(env.GOOGLE_GENERATIVE_AI_API_KEY)
      : normalizeEnvValue(env.CLOUDFLARE_API_TOKEN))
  );
}

export function readEmbeddingConfig(
  env: Record<string, string | undefined> = readRuntimeEnv(),
): EmbeddingConfig {
  const provider = resolveEmbeddingProvider(env);
  const apiKey = resolveEmbeddingApiKey(provider, env);

  if (!apiKey) {
    throw new AIConfigError(
      `AI_API_KEY is not configured for provider "${provider}".`,
    );
  }

  const model =
    normalizeEnvValue(env.EMBEDDING_MODEL) ??
    (provider === 'google' ? DEFAULT_GOOGLE_EMBEDDING_MODEL : undefined);

  if (!model) {
    throw new AIConfigError(
      `EMBEDDING_MODEL is not configured for provider "${provider}".`,
    );
  }

  if (provider === 'google') {
    return {
      apiKey,
      model,
      provider,
    };
  }

  const accountId =
    normalizeEnvValue(env.AI_ACCOUNT_ID) ??
    normalizeEnvValue(env.CLOUDFLARE_ACCOUNT_ID);

  if (!accountId) {
    throw new AIConfigError(
      `AI_ACCOUNT_ID is not configured for provider "${provider}".`,
    );
  }

  return {
    accountId,
    apiKey,
    model,
    provider,
  };
}

export function createEmbeddingModel(
  config: EmbeddingConfig = readEmbeddingConfig(),
) {
  if (config.provider === 'google') {
    return createGoogleGenerativeAI({
      apiKey: config.apiKey,
    }).embeddingModel(config.model);
  }

  return createOpenAICompatible({
    apiKey: config.apiKey,
    baseURL: CLOUDFLARE_OPENAI_COMPAT_BASE_URL(config.accountId),
    name: 'cloudflare',
  }).embeddingModel(config.model);
}

export async function embedQuery(query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error('`query` is required for semantic retrieval.');
  }

  const env = readRuntimeEnv();
  const embeddingConfig = readEmbeddingConfig(env);
  const vectorDimensions = readEmbeddingVectorDimensions(env);
  const { embedding } = await embed({
    model: createEmbeddingModel(embeddingConfig),
    providerOptions:
      embeddingConfig.provider === 'google'
        ? {
            google: {
              outputDimensionality: vectorDimensions,
              taskType: 'RETRIEVAL_QUERY',
            },
          }
        : undefined,
    value: normalizedQuery,
  });

  if (embedding.length !== vectorDimensions) {
    throw new AIConfigError(
      `Embedding model "${embeddingConfig.model}" produced ${embedding.length} dimensions, but the database expects ${vectorDimensions}. Update EMBEDDING_DIMENSIONS or switch to a compatible embedding model.`,
    );
  }

  return embedding;
}
