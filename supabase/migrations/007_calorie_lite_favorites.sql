-- 007_calorie_lite_favorites.sql — MyFitnessPal-parity Wave 2-B: star-favorite
-- foods (recent-foods live-derived from app_calorie_entries, no table needed).
-- Applied 2026-08-09.
--
-- Adds:
--   food_favorites  User-owned favorite pointer into `foods` OR `custom_foods`.
--
-- Design notes:
--   - Exactly one of (food_id, custom_food_id) must be non-null. Enforced by
--     two CHECK constraints so a corrupt insert cannot straddle both catalogs.
--   - Partial unique indexes on (user_id, food_id) and (user_id, custom_food_id)
--     ensure the "already favorited?" lookup is O(index) AND the POST endpoint
--     can rely on the DB to reject a dupe if the app-layer idempotency check
--     races.
--   - ON DELETE CASCADE on both FKs — if a public food is retired or a custom
--     food is deleted, the favorite row goes with it. There is nothing to
--     preserve; a "favorite" without a food is a broken pointer.
--   - RLS is owner-only for all ops. Explicit `.eq('user_id', user.id)` in the
--     API is belt-and-suspenders on top of RLS.

create table if not exists food_favorites (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  food_id        text references foods(id) on delete cascade,
  custom_food_id uuid references custom_foods(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint food_favorites_target_present
    check ((food_id is not null) or (custom_food_id is not null)),
  constraint food_favorites_target_exclusive
    check (not (food_id is not null and custom_food_id is not null))
);

create unique index if not exists food_favorites_user_food_uidx
  on food_favorites (user_id, food_id)
  where food_id is not null;

create unique index if not exists food_favorites_user_custom_food_uidx
  on food_favorites (user_id, custom_food_id)
  where custom_food_id is not null;

create index if not exists food_favorites_user_created_idx
  on food_favorites (user_id, created_at desc);

alter table food_favorites enable row level security;

drop policy if exists food_favorites_owner_all on food_favorites;
create policy food_favorites_owner_all on food_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
