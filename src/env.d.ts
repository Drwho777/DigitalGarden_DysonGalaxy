/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly AI_PROVIDER?: string;
  readonly AI_MODEL?: string;
  readonly AI_API_KEY?: string;
  readonly AI_ACCOUNT_ID?: string;
  readonly GOOGLE_GENERATIVE_AI_API_KEY?: string;
  readonly CLOUDFLARE_API_TOKEN?: string;
  readonly CLOUDFLARE_ACCOUNT_ID?: string;
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
