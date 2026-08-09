-- 015_copilot_threads.sql — persistent copilot chat threads + messages.
--
-- Motivation:
--   v0.5 shipped the copilot as a single ephemeral session — refreshing the
--   page nuked the chat. Real AI chat apps have thread history (Claude,
--   ChatGPT, Gemini). This migration adds owner-only tables that store the
--   raw UIMessage.parts jsonb so re-hydration is loss-free (text, tool
--   invocations, reasoning, and image parts all round-trip).
--
-- Design:
--   - `copilot_threads` — one row per conversation. `context` optionally
--     scopes the thread to a mini-app ('calorie-lite') so the client can
--     route back to the right surface. `archived_at` = soft delete.
--   - `copilot_messages` — one row per UIMessage. Full `parts` jsonb kept
--     as-is; role is a text CHECK enum so future roles ('system-note',
--     'tool-out') land without a migration.
--   - `last_message_at` on threads is denormalized (kept in sync via the
--     API route) so listing threads by "most recently used" is a plain
--     index scan, not a subquery. Trigger keeps `updated_at` fresh.
--   - Owner-only RLS mirrors the copilot_tool_calls pattern (v0.4).
--
-- Applied 2026-08-10.

create table if not exists copilot_threads (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  title            text not null default 'New chat',
  context          text,
  last_message_at  timestamptz not null default now(),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Filter archived threads out of the hot list. Includes `archived_at is null`
-- as a partial index so it's compact even after months of soft-deletes.
create index if not exists copilot_threads_user_recent_idx
  on copilot_threads (user_id, last_message_at desc)
  where archived_at is null;

drop trigger if exists copilot_threads_updated_at on copilot_threads;
create trigger copilot_threads_updated_at
  before update on copilot_threads
  for each row execute function set_updated_at();

alter table copilot_threads enable row level security;

drop policy if exists copilot_threads_owner_select on copilot_threads;
create policy copilot_threads_owner_select on copilot_threads
  for select using (auth.uid() = user_id);

drop policy if exists copilot_threads_owner_insert on copilot_threads;
create policy copilot_threads_owner_insert on copilot_threads
  for insert with check (auth.uid() = user_id);

drop policy if exists copilot_threads_owner_update on copilot_threads;
create policy copilot_threads_owner_update on copilot_threads
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists copilot_threads_owner_delete on copilot_threads;
create policy copilot_threads_owner_delete on copilot_threads
  for delete using (auth.uid() = user_id);

-- ─── copilot_messages ──────────────────────────────────────────────────────

create table if not exists copilot_messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references copilot_threads(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('user','assistant','system')),
  parts        jsonb not null,
  created_at   timestamptz not null default now()
);

-- Chronological read within a thread — the paginate-forward pattern.
create index if not exists copilot_messages_thread_created_idx
  on copilot_messages (thread_id, created_at asc);

-- Owner-only for listing across threads (rare, but debug-friendly).
create index if not exists copilot_messages_user_created_idx
  on copilot_messages (user_id, created_at desc);

alter table copilot_messages enable row level security;

drop policy if exists copilot_messages_owner_select on copilot_messages;
create policy copilot_messages_owner_select on copilot_messages
  for select using (auth.uid() = user_id);

drop policy if exists copilot_messages_owner_insert on copilot_messages;
create policy copilot_messages_owner_insert on copilot_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists copilot_messages_owner_update on copilot_messages;
create policy copilot_messages_owner_update on copilot_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists copilot_messages_owner_delete on copilot_messages;
create policy copilot_messages_owner_delete on copilot_messages
  for delete using (auth.uid() = user_id);
