import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

async function loadServerModule() {
  vi.resetModules();
  return import('../../src/lib/supabase/server');
}

describe('createServerSupabaseClient', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockReset();
    process.env = { ...originalEnv };
  });

  it('creates a server-only supabase client with the service role key', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    createClientMock.mockReturnValue({ kind: 'supabase-client' });

    const { createServerSupabaseClient } = await loadServerModule();
    const client = createServerSupabaseClient();

    expect(client).toEqual({ kind: 'supabase-client' });
    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  });

  it('falls back to PUBLIC_SUPABASE_URL when SUPABASE_URL is absent', async () => {
    process.env.PUBLIC_SUPABASE_URL = 'https://public.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    createClientMock.mockReturnValue({ kind: 'supabase-client' });

    const { createServerSupabaseClient } = await loadServerModule();
    createServerSupabaseClient();

    expect(createClientMock).toHaveBeenCalledWith(
      'https://public.supabase.co',
      'service-role-key',
      expect.any(Object),
    );
  });
});
