-- ============================================================================
-- Migration 009 — Web Push notifications infrastructure.
--
-- Tables:
--   push_subscriptions — one row per (user, browser install). Keyed on
--                        `endpoint` (the browser's PushSubscription URL) so
--                        the same device re-subscribing dedupes cleanly.
--   push_deliveries    — audit trail of every send attempt. Service-role
--                        writes only; no RLS (no anon read).
--   push_broadcasts    — one row per broadcast fan-out (topic + optional
--                        version). Unique on (topic, version) when version
--                        is set — prevents double-firing on redeploy.
--
-- Preferences additions:
--   push_enabled  bool  — device-level opt-in flag, persisted so we can
--                          remember the user said yes on this account.
--   push_topics   text[] — allow-list of topics the user wants. Defaults to
--                          {releases}; future topics: insights, streaks, etc.
-- ============================================================================

-- ── push_subscriptions ─────────────────────────────────────────────────────
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- Owner-only. Endpoint is the natural dedupe key; users can upsert their
-- own subscriptions from the client.
drop policy if exists push_subs_owner_select on push_subscriptions;
create policy push_subs_owner_select on push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists push_subs_owner_insert on push_subscriptions;
create policy push_subs_owner_insert on push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists push_subs_owner_update on push_subscriptions;
create policy push_subs_owner_update on push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists push_subs_owner_delete on push_subscriptions;
create policy push_subs_owner_delete on push_subscriptions
  for delete using (auth.uid() = user_id);

-- ── preferences columns ────────────────────────────────────────────────────
alter table preferences
  add column if not exists push_enabled boolean not null default false;

alter table preferences
  add column if not exists push_topics text[] not null default array['releases']::text[];

-- ── push_deliveries ────────────────────────────────────────────────────────
create table if not exists push_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references push_subscriptions(id) on delete set null,
  topic text,
  payload jsonb,
  sent_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'gone', 'error')),
  error_message text
);

create index if not exists push_deliveries_topic_idx
  on push_deliveries (topic, sent_at desc);

-- No RLS — service-role only. Explicit revoke on anon/authenticated so a
-- misuse can never leak the audit trail.
alter table push_deliveries enable row level security;
-- (No policies granted — enable RLS + zero policies = deny-all for non-service roles.)

-- ── push_broadcasts ────────────────────────────────────────────────────────
create table if not exists push_broadcasts (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  version text,
  title text not null,
  body text not null,
  url text,
  sent_at timestamptz not null default now(),
  sent_count int not null default 0,
  failed_count int not null default 0
);

-- Unique on (topic, version) when version is not null — prevents
-- double-sending the "v0.3.2 release" broadcast on redeploy.
create unique index if not exists push_broadcasts_topic_version_uniq
  on push_broadcasts (topic, version)
  where version is not null;

alter table push_broadcasts enable row level security;
-- Service-role only — no policies means anon + authenticated are blocked.
