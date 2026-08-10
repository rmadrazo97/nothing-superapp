-- 020_mini_app_settings.sql
--
-- Per-mini-app, per-user settings store.
--
-- Every mini-app that ships an in-app settings panel writes its state
-- into this one table keyed by (user_id, slug). Values are a free-form
-- jsonb blob — the mini-app owns its schema; the server just stores +
-- returns whatever the client sends. Callers should shallow-merge on
-- PATCH so a partial update (e.g. bumping just `weightUnit`) doesn't
-- clobber unrelated keys.
--
-- Why not columns per mini-app? We add mini-apps weekly and each one
-- averages 2-6 settings. A jsonb-per-slug avoids a migration on every
-- new mini-app and keeps the RLS surface tiny (one policy covers all).
--
-- Owner-only RLS — users can never read or write another user's row.
create table if not exists public.mini_app_settings (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  slug       text        not null,
  settings   jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, slug)
);

alter table public.mini_app_settings enable row level security;

-- Single ALL policy is fine — the row's identity IS the ownership check.
drop policy if exists "users manage own" on public.mini_app_settings;
create policy "users manage own"
  on public.mini_app_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Slug lookup index (queries always filter user_id via RLS + primary key,
-- but ad-hoc admin queries by slug are common enough to warrant this).
create index if not exists mini_app_settings_slug_idx
  on public.mini_app_settings (slug);
