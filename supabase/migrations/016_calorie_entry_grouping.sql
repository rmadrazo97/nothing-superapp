-- 016_calorie_entry_grouping.sql — soft grouping for calorie entries.
--
-- Motivation:
--   Logging a meal from a plan currently inserts one `app_calorie_entries`
--   row per quantified ingredient. On the TODAY view this explodes into 5–7
--   sibling rows for a single meal, which drowns manual entries. We want a
--   single "Comida · Opción 2" card that expands to reveal the ingredients
--   (with per-row EDIT + DELETE still working). The card also needs a
--   "delete the whole meal" affordance.
--
-- Design:
--   - `meal_group_id` is a plain uuid, NOT a foreign key. Grouping is soft:
--     the label is a snapshot at log-time, and deleting the meal plan (or
--     even the option) must NOT cascade the entries — the user's history
--     stays intact. Nullable so all existing rows keep working; solo entries
--     never carry a group id.
--   - `meal_group_label` is a snapshot too (e.g. "Comida · Opción 2"). Kept
--     denormalized on every row so the client doesn't need to re-derive the
--     label from the plan blob each render.
--   - Partial index on (user_id, meal_group_id) WHERE meal_group_id is not
--     null keeps the index tiny (only grouped rows) while still supporting
--     "delete every row in this group" queries in one hop.
--
-- Applied 2026-08-10.

alter table app_calorie_entries
  add column if not exists meal_group_id uuid;

alter table app_calorie_entries
  add column if not exists meal_group_label text;

create index if not exists app_calorie_entries_meal_group_idx
  on app_calorie_entries (user_id, meal_group_id)
  where meal_group_id is not null;
