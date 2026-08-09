-- 006_calorie_lite_body_profile.sql — first-run onboarding profile fields.
-- Applied 2026-08-09.
--
-- Adds nullable body-composition + intent columns to `preferences` so the
-- calorie-lite mini-app can compute a calorie target automatically via
-- Mifflin-St Jeor (BMR) → activity multiplier → goal delta.
--
-- All columns are NULL by default so existing users are not broken; the
-- onboarding wizard fills them in on first run. `onboarded_at` doubles as
-- a "we've asked" flag — set to now() even when the user picks SKIP so we
-- don't re-prompt on every mount.
--
-- Idempotent: `add column if not exists` + `do $$ … $$` guarded checks so
-- reapplying this migration is safe.

-- sex — required for BMR formula (male/female differ; 'other' averages).
alter table preferences add column if not exists sex text;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'preferences' and constraint_name = 'preferences_sex_check'
  ) then
    alter table preferences
      add constraint preferences_sex_check
      check (sex is null or sex in ('male','female','other'));
  end if;
end $$;

-- age_years — used in BMR formula. Sanity-bound 1..129.
alter table preferences add column if not exists age_years int;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'preferences' and constraint_name = 'preferences_age_years_check'
  ) then
    alter table preferences
      add constraint preferences_age_years_check
      check (age_years is null or (age_years > 0 and age_years < 130));
  end if;
end $$;

-- height_cm — stored in cm for locale-independence; UI converts to ft/in.
alter table preferences add column if not exists height_cm numeric(5,1);
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'preferences' and constraint_name = 'preferences_height_cm_check'
  ) then
    alter table preferences
      add constraint preferences_height_cm_check
      check (height_cm is null or (height_cm > 50 and height_cm < 260));
  end if;
end $$;

-- activity_level — Harris-Benedict activity multipliers.
alter table preferences add column if not exists activity_level text;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'preferences' and constraint_name = 'preferences_activity_level_check'
  ) then
    alter table preferences
      add constraint preferences_activity_level_check
      check (activity_level is null or activity_level in ('sedentary','light','moderate','active','very_active'));
  end if;
end $$;

-- goal_direction — cut / maintain / bulk. Rate + kcal delta live in app code.
alter table preferences add column if not exists goal_direction text;
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'preferences' and constraint_name = 'preferences_goal_direction_check'
  ) then
    alter table preferences
      add constraint preferences_goal_direction_check
      check (goal_direction is null or goal_direction in ('lose','maintain','gain'));
  end if;
end $$;

-- onboarded_at — set on first wizard completion OR on "skip"; used as the
-- "don't re-prompt" flag alongside age_years == null (age null AND onboarded_at
-- null == first mount).
alter table preferences add column if not exists onboarded_at timestamptz;
