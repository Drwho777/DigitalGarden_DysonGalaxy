export type AIProviderId = 'google' | 'cloudflare';

export interface GoogleAIConfig {
  apiKey: string;
  model: string;
  provider: 'google';
}

export interface CloudflareAIConfig {
  accountId: string;
  apiKey: string;
  model: string;
  provider: 'cloudflare';
}

export type AIProviderConfig = GoogleAIConfig | CloudflareAIConfig;

export type RuntimeEnv = Record<string, string | undefined>;

export const DEFAULT_AI_PROVIDER: AIProviderId = 'google';
export const DEFAULT_GOOGLE_MODEL = 'gemini-2.5-flash';

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigError';
  }
}

function normalizeEnvValue(value: string | undefined) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

export function readRuntimeEnv(): RuntimeEnv {
  const importMetaEnv = (
    import.meta as ImportMeta & {
      env?: RuntimeEnv;
    }
  ).env;

  const runtimeGlobal = globalThis as typeof globalThis & {
    process?: {
      env?: RuntimeEnv;
    };
  };

  return {
    ...(runtimeGlobal.process?.env ?? {}),
    ...(importMetaEnv ?? {}),
  };
}

function resolveProvider(env: RuntimeEnv): AIProviderId {
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

function resolveApiKey(
  provider: AIProviderId,
  env: RuntimeEnv,
): string | undefined {
  const genericApiKey = normalizeEnvValue(env.AI_API_KEY);
  if (genericApiKey) {
    return genericApiKey;
  }

  if (provider === 'google') {
    return normalizeEnvValue(env.GOOGLE_GENERATIVE_AI_API_KEY);
  }

  return normalizeEnvValue(env.CLOUDFLARE_API_TOKEN);
}

function resolveModel(provider: AIProviderId, env: RuntimeEnv): string {
  const configuredModel = normalizeEnvValue(env.AI_MODEL);
  if (configuredModel) {
    return configuredModel;
  }

  if (provider === 'google') {
    return DEFAULT_GOOGLE_MODEL;
  }

  throw new AIConfigError(`AI_MODEL is not configured for provider "${provider}".`);
}

export function resolveAIConfig(env: RuntimeEnv = readRuntimeEnv()): AIProviderConfig {
  const provider = resolveProvider(env);
  const apiKey = resolveApiKey(provider, env);

  if (!apiKey) {
    throw new AIConfigError(`AI_API_KEY is not configured for provider "${provider}".`);
  }

  const model = resolveModel(provider, env);

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
