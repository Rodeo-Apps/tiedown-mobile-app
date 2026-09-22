-- =====================================================================
-- 006 — Premium revocation support
--
-- Adds the plumbing needed to REVOKE premium (not just grant it):
--   1. profiles.premium_expires_at — when the current entitlement lapses.
--   2. revenuecat_webhook_events   — audit log for every RC webhook received.
--
-- Shared verbatim across every RevenueCat RodeoApps event app. They all use
-- the same Supabase project (qptqfjtwonnfdaqlmrhj), so this only needs to be
-- applied once; it is fully idempotent so re-running is safe.
-- =====================================================================

-- 1. Premium expiry tracking on profiles -----------------------------------
alter table if exists public.profiles
  add column if not exists premium_expires_at timestamptz;

comment on column public.profiles.premium_expires_at is
  'When the active premium entitlement expires. NULL = no expiry known / lifetime. '
  'Set on purchase & webhook, checked on app launch to reconcile has_premium_access.';

-- 2. Webhook audit log ------------------------------------------------------
create table if not exists public.revenuecat_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  event_type text not null,
  app_user_id text,
  entitlement_id text,
  resolved_active boolean,
  resolved_expires_at timestamptz,
  resolution_source text,          -- 'revenuecat_api' | 'event_type'
  payload jsonb,
  received_at timestamptz not null default now()
);

create index if not exists idx_rc_webhook_events_app_user
  on public.revenuecat_webhook_events (app_user_id);
create index if not exists idx_rc_webhook_events_received_at
  on public.revenuecat_webhook_events (received_at desc);

-- Row Level Security: only the service role (used by the edge function) writes
-- or reads this table. No anon/authenticated access — it is an internal audit
-- log. With RLS enabled and no permissive policies, client roles are denied by
-- default while the service role bypasses RLS entirely.
alter table public.revenuecat_webhook_events enable row level security;
