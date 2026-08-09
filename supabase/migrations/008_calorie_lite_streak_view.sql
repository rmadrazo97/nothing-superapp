-- 008_calorie_lite_streak_view.sql — daily-totals VIEW for cheap streak +
-- insights aggregation on the server. Applied 2026-08-09.
--
-- Motivation:
--   Wave 2-C adds a /streak endpoint and an /insights endpoint. Both need
--   per-day rollups of the caller's calorie entries. Rather than pull all
--   rows into Node and re-bucket them on every request, we expose a VIEW
--   that GROUP BYs once inside Postgres. The view is security_invoker so
--   the underlying `app_calorie_entries` RLS (owner-only) still applies —
--   no auth bypass, no need for a separate policy on the view itself.
--
-- Notes:
--   - `day` is computed from `entered_at at time zone 'UTC'` for now. When
--     we add per-user tz preference, swap the timezone reference here.
--   - The (user_id, (entered_at at time zone 'UTC')::date) index makes
--     both the view's GROUP BY and any direct UTC-day filter cheap. We
--     can't index `entered_at::date` directly because casting a timestamptz
--     to date is not IMMUTABLE (it depends on session TimeZone); anchoring
--     to UTC makes the expression deterministic and index-able.

-- Helper index on the base table.
create index if not exists app_calorie_entries_user_day_idx
  on app_calorie_entries (user_id, ((entered_at at time zone 'UTC')::date));

-- The daily-totals view.
create or replace view calorie_daily_totals as
select
  user_id,
  (entered_at at time zone 'UTC')::date as day,
  count(*)::int                      as entry_count,
  coalesce(sum(kcal), 0)::numeric        as total_kcal,
  coalesce(sum(protein_g), 0)::numeric   as total_protein_g,
  coalesce(sum(carbs_g), 0)::numeric     as total_carbs_g,
  coalesce(sum(fat_g), 0)::numeric       as total_fat_g,
  coalesce(sum(fiber_g), 0)::numeric     as total_fiber_g,
  coalesce(sum(sugar_g), 0)::numeric     as total_sugar_g,
  coalesce(sum(sodium_mg), 0)::numeric   as total_sodium_mg,
  coalesce(sum(cholesterol_mg), 0)::numeric as total_cholesterol_mg
from app_calorie_entries
group by user_id, (entered_at at time zone 'UTC')::date;

-- Respect the underlying table's RLS. Without this, the view would execute
-- as its owner (superuser) and leak everyone's data. security_invoker=on
-- forces the query to run as the caller — so the owner-only policy on
-- app_calorie_entries applies transparently.
alter view calorie_daily_totals set (security_invoker = on);

-- Let authenticated users read the view (RLS still filters rows to owner).
grant select on calorie_daily_totals to authenticated;
