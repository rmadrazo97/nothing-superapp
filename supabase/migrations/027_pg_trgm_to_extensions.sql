-- 027_pg_trgm_to_extensions.sql — move pg_trgm out of `public` into `extensions`.
--
-- WHY
-- ───
-- Supabase's Security Advisor (Splinter lint `extension_in_public`) flags
-- every extension installed in the `public` schema as a WARN. The reasoning
-- is privilege-boundary hygiene: `public` is writable-ish and full of user
-- objects, so extension operators + functions co-mingling there widen the
-- attack surface if a role's search_path is ever tampered with. The
-- Supabase-blessed convention is a dedicated `extensions` schema that
-- lives higher on the resolution order for the managed roles.
--
-- Deferred from migration 026 (see the "NOT addressed here" note in that
-- file) because moving the extension changes how `similarity()`,
-- `word_similarity()`, `%`, and `gin_trgm_ops` resolve. This migration
-- is the follow-up.
--
-- WHY THIS IS SAFE WITHOUT RECREATING THE GIN INDEXES
-- ────────────────────────────────────────────────────
-- Supabase-managed roles (`anon`, `authenticated`, `service_role`,
-- `authenticator`, `postgres`) already ship with
--     search_path = "$user", public, extensions
-- so unqualified references like `similarity(...)`, `%`, and
-- `gin_trgm_ops` continue to resolve after the extension moves — the
-- resolver just walks one more schema. `ALTER EXTENSION ... SET SCHEMA`
-- rewrites the pg_depend edges for the extension's objects (operator
-- classes, functions, operators) in place; it does NOT invalidate the
-- indexes that reference `gin_trgm_ops`, because the operator class
-- object identity (its OID) stays the same across the move — only its
-- schema qualifier changes.
--
-- Concretely, the following objects continue to work unchanged:
--   • `foods_name_trgm_idx`         (migration 014, GIN gin_trgm_ops on lower(name))
--   • `food_aliases_alias_trgm_idx` (migration 018, GIN gin_trgm_ops on lower(alias))
--   • Any SQL using `similarity()`, `%`, `word_similarity()`, `<->`
--     against those columns (resolve-ingredient.ts pass 2 + pass 3,
--     the optional `resolve_ingredient_alias_fuzzy` /
--     `resolve_ingredient_food_fuzzy` RPCs referenced from
--     apps/web/src/lib/foods/resolve-ingredient.ts).
--
-- Verified by inspection: the only trigram touch-points in this repo are
-- the two GIN indexes above and the SQL-side `similarity()` calls in the
-- resolve-ingredient RPC path. The `similarity()` used in
-- apps/web/src/app/api/mini-apps/calorie-lite/foods/route.ts is a
-- JS-local Jaccard trigram helper, NOT the pg_trgm function — so it's
-- unaffected.
--
-- Rollback strategy at the bottom of this file.
--
-- Idempotency: guarded so a re-apply on an already-moved DB is a no-op.

-- 1. Ensure the target schema exists. Supabase provisions it by default
--    for all new projects, but be defensive for local dev / fresh CI DBs.
create schema if not exists extensions;

-- 2. Move the extension. Guarded via a DO block so re-runs on an already-
--    moved database don't error.
do $$
declare
  current_ext_schema text;
begin
  select n.nspname
    into current_ext_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';

  if current_ext_schema is null then
    -- Extension not installed at all — install directly into extensions.
    -- Matches the intent of migrations 014 + 018 which called
    -- `create extension if not exists pg_trgm` (without a schema).
    execute 'create extension if not exists pg_trgm schema extensions';
  elsif current_ext_schema <> 'extensions' then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end $$;

-- 3. Belt-and-suspenders: make sure the Supabase-managed roles have
--    `extensions` on their search_path. Supabase sets this by default,
--    but a self-hosted or migrated-from-elsewhere project might not.
--    These ALTERs are no-ops if the search_path is already correct.
--
--    We intentionally do NOT touch `postgres` or `authenticator` here —
--    those are managed by Supabase's own migrations and mucking with
--    them can conflict with platform upgrades. `anon` / `authenticated` /
--    `service_role` are the three roles that actually execute user
--    queries through PostgREST.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'alter role anon set search_path = "$user", public, extensions';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'alter role authenticated set search_path = "$user", public, extensions';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'alter role service_role set search_path = "$user", public, extensions';
  end if;
end $$;

-- 4. Verify the move took. If someone reverts + re-applies, this raises
--    a loud error so the operator notices the state mismatch instead of
--    the migration silently succeeding with the extension still in public.
do $$
declare
  ext_schema text;
begin
  select n.nspname
    into ext_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';

  if ext_schema is null then
    raise exception 'pg_trgm extension missing after migration — investigate before proceeding';
  end if;

  if ext_schema <> 'extensions' then
    raise exception 'pg_trgm still in schema % after migration (expected extensions)', ext_schema;
  end if;

  raise notice 'pg_trgm is in schema %', ext_schema;
end $$;

-- ────────────────────────────────────────────────────────────────────────
-- POST-APPLY VERIFICATION (run manually in psql / SQL editor)
-- ────────────────────────────────────────────────────────────────────────
--
-- 1. Confirm the extension moved:
--    select nspname
--      from pg_extension e
--      join pg_namespace n on n.oid = e.extnamespace
--     where extname = 'pg_trgm';
--    -- Expect: 'extensions'
--
-- 2. Confirm the GIN indexes still resolve gin_trgm_ops via the new schema:
--    select indexname, indexdef
--      from pg_indexes
--     where indexname in ('foods_name_trgm_idx', 'food_aliases_alias_trgm_idx');
--    -- Expect: indexdef references gin_trgm_ops (unqualified is fine; the
--    -- operator class OID is stable across the schema move).
--
-- 3. Smoke-test food search (the whole reason this extension exists):
--    select name, similarity(lower(name), 'sweet potato') as sim
--      from foods
--     where lower(name) % 'sweet potato'
--     order by sim desc
--     limit 5;
--    -- Expect: canonical sweet potato rows in the top 5.
--
-- 4. Smoke-test alias fuzzy (resolve-ingredient pass 2):
--    select alias, similarity(lower(alias), 'pechuga pollo') as sim
--      from food_aliases
--     where lower(alias) % 'pechuga pollo'
--     order by sim desc
--     limit 5;
--    -- Expect: 'pechuga de pollo' at the top with sim >= 0.4.
--
-- If any of the above return no rows or throw "function similarity does
-- not exist", ROLL BACK (see below) and file a bug — it means the
-- managed roles didn't have `extensions` in their search_path.
--
-- ────────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ────────────────────────────────────────────────────────────────────────
--
-- If food search regresses after apply, revert the extension move + role
-- search_paths with the following (paste into psql as the DB owner):
--
--   alter extension pg_trgm set schema public;
--
--   -- Optional: restore the original (default) role search_paths.
--   -- Only run these if you're SURE the pre-027 values were the defaults;
--   -- otherwise capture the current search_path first via
--   --   select rolname, rolconfig from pg_roles where rolname in
--   --     ('anon','authenticated','service_role');
--   alter role anon          reset search_path;
--   alter role authenticated reset search_path;
--   alter role service_role  reset search_path;
--
-- Note: DO NOT `drop extension pg_trgm` under any circumstance — that
-- cascade-drops every GIN trigram index on `foods` + `food_aliases` and
-- silently breaks food search across the app.
