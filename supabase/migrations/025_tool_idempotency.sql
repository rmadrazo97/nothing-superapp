-- 025_tool_idempotency.sql — dedupe repeat tool invocations at the DB layer.
-- Applied 2026-08-10.
--
-- Motivation:
--   The copilot's agent loop occasionally re-emits the same tool call
--   (create_reminder, log_calorie_entry, …) inside a single turn — either
--   because the model hallucinated a retry after seeing its own output,
--   or because a client-side re-render tripped the SSE. Symptom: users
--   saw two identical reminders / two identical calorie entries land
--   from one intent.
--
-- Design:
--   - Add `idempotency_key text` to `copilot_tool_calls`. Nullable so
--     read-only tools (search_foods, get_daily_summary) don't have to
--     compute one.
--   - Partial UNIQUE index on (user_id, idempotency_key) WHERE key IS
--     NOT NULL. Write tools compute the key as SHA-256 of
--     `tool_name + JSON(input) + user_id + floor(now/30s)`. Two identical
--     invocations within the same 30-second bucket collide → 23505 → the
--     tool's execute() short-circuits and returns the prior output.
--   - 30-second bucket is the compromise between "block ALL retries"
--     (would defeat legit re-runs an hour later) and "no dedupe at all"
--     (the observed race window is < 5s). 30s catches every observed
--     dup while leaving legit repeats untouched.
--   - No RLS policy change — insert stays owner-only via the existing
--     `copilot_tool_calls_owner_insert` policy; the unique-violation
--     path returns from the app-side helper, not the RLS layer.

alter table copilot_tool_calls
  add column if not exists idempotency_key text;

create unique index if not exists copilot_tool_calls_idempotency_key_idx
  on copilot_tool_calls (user_id, idempotency_key)
  where idempotency_key is not null;

comment on column copilot_tool_calls.idempotency_key is
  'SHA-256 hex of (tool_name || json(input) || user_id || floor(epoch/30)). Present on write tools; NULL on reads. Duplicate hash within the 30-second bucket collides on the partial unique index — the tool_call helper short-circuits and returns the prior output.';
