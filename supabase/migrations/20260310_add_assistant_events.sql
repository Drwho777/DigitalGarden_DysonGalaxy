create table if not exists public.assistant_events (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  route_type text not null,
  star_id text,
  planet_id text,
  slug text,
  interaction_intent text not null,
  action_type text,
  action_target_id text,
  success boolean not null,
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists assistant_events_created_at_idx
  on public.assistant_events (created_at desc);

alter table public.assistant_events enable row level security;

comment on table public.assistant_events is
  'Server-only observability log for assistant requests, scope, intent, and outcomes.';

-- Intentionally no anon/authenticated policy.
-- Assistant events are written server-side with service-role access only.
