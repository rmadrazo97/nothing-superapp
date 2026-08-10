-- 024_profile_timezone.sql — persist the user's IANA timezone on `profiles`.
-- Applied 2026-08-10.
--
-- Motivation:
--   The copilot's create_reminder tool needs a stable IANA zone (e.g.
--   'America/Mexico_City') to schedule fires correctly. Prior to this
--   migration the client sent no timezone → server defaulted to 'UTC' →
--   a "remind me in 10 min" reminder pointed at LOCAL 10 min ended up
--   firing at whatever UTC-derived local time happened to be, which
--   drifted for non-UTC users.
--
--   Storing it on `profiles` (not `preferences`) because it's an identity
--   attribute, not a UI setting, and lets the tool read it in one join.
--
-- Design:
--   - Nullable. NULL means "we haven't captured it yet — fall back to
--     browser tz on the request, then UTC". No backfill: the settings page
--     + client-side inject will populate it on next visit.
--   - No enum / CHECK on the value — IANA adds/renames zones periodically
--     and Postgres has no IANA validator. Zod at the API boundary is the
--     validator (`z.string().min(1).max(64)`).
--   - No index — profiles is one row per user, always looked up by PK.

alter table profiles
  add column if not exists timezone text;

comment on column profiles.timezone is
  'IANA timezone (e.g. America/Mexico_City). Captured from browser Intl.DateTimeFormat().resolvedOptions().timeZone on first visit; user-editable in Settings → Profile. Copilot reads this to schedule reminders in local time.';
