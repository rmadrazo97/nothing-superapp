-- 004_profiles_autocreate_and_backfill.sql
-- Applied 2026-08-09.
--
-- Prod bug: Google-OAuth users landed at /app with no `profiles` row because
-- the auth callback tried to upsert non-existent columns (email,
-- subscription_status) and silently failed. Symptom: PATCH /api/profile
-- returned "db_error" because the UPDATE matched zero rows.
--
-- Fix: move the responsibility from application code to a database trigger.
-- Every new auth.users row gets a matching profiles row automatically. This
-- also handles OAuth providers, admin.createUser, and any other path that
-- creates auth.users records — application code doesn't need to remember.
--
-- Also backfill profiles rows for any existing auth.users that don't have one
-- (jmadrazo7 caught this during the live QA sweep).

-- ────────────────────────────────────────────────────────────────
-- Trigger: on new auth.users → insert into profiles (id-only)
-- ────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ON CONFLICT DO NOTHING so a race with the app's own bootstrap (or a
  -- re-fired trigger from an admin.updateUser call misinterpreted as insert)
  -- doesn't duplicate-key error.
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────────
-- Backfill: create profiles for existing auth.users that lack one
-- ────────────────────────────────────────────────────────────────
insert into public.profiles (id)
select u.id
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
