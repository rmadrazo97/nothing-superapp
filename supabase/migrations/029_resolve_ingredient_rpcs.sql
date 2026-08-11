-- 029_resolve_ingredient_rpcs.sql — the two fuzzy-resolve RPCs that
-- apps/web/src/lib/foods/resolve-ingredient.ts has been calling since v0.4.x,
-- but that were never in any prior migration.
--
-- Discovered by v0.5.8 W12 while diagnosing short-query search: pass 3 +
-- pass 4 in `resolve-ingredient.ts` reference these RPCs; they've been
-- missing from prod's schema cache the whole time, so those passes have
-- effectively been no-ops (falling through to the pass-4 ILIKE fallback
-- which orders by kcal DESC — nonsense).
--
-- This is a THIRD class of drift not covered by v0.5.5 or v0.5.7 safety
-- nets:
--   1. Table/column DDL committed but not applied ← verify-migrations
--   2. Backfill script committed but never run    ← verify-backfills
--   3. RPC referenced by client code but not defined in any migration ← new
--
-- v0.5.9+ candidate: extend verify-migrations to also introspect
-- pg_proc for RPCs referenced by supabase.rpc() calls in the client.

-- ── resolve_ingredient_alias_fuzzy ─────────────────────────────────────────
-- Given a text needle, returns the food_aliases row with the highest
-- trigram similarity to `alias`. Uses `extensions.similarity` (schema-
-- qualified because pg_trgm lives in `extensions` post migration 027).
create or replace function public.resolve_ingredient_alias_fuzzy(needle text)
  returns table (
    food_id text,
    similarity real
  )
  language sql
  stable
  security invoker
  set search_path = public, extensions, pg_temp
as $$
  select
    a.food_id,
    similarity(lower(a.alias), lower(needle)) as similarity
  from public.food_aliases a
  where lower(a.alias) % lower(needle)
  order by similarity(lower(a.alias), lower(needle)) desc
  limit 1;
$$;

comment on function public.resolve_ingredient_alias_fuzzy(text) is
  'Trigram-fuzzy alias resolver. Called by apps/web/src/lib/foods/resolve-ingredient.ts pass 3. Returns at most one row (the best-similarity alias hit) with the associated food_id + similarity score. Missing before mig 029 — passes silently no-op''d for months.';

-- ── resolve_ingredient_food_fuzzy ──────────────────────────────────────────
-- Given a text needle, returns the foods row with the highest trigram
-- similarity to `name`. Ordered so canonical rows tiebreak within the
-- top similarity bucket (mirrors the v0.5.7 route.ts JS sort key).
create or replace function public.resolve_ingredient_food_fuzzy(needle text)
  returns table (
    id text,
    similarity real
  )
  language sql
  stable
  security invoker
  set search_path = public, extensions, pg_temp
as $$
  select
    f.id,
    similarity(lower(f.name), lower(needle)) as similarity
  from public.foods f
  where lower(f.name) % lower(needle)
  order by
    f.is_canonical desc nulls last,
    f.rank_penalty asc nulls last,
    similarity(lower(f.name), lower(needle)) desc
  limit 1;
$$;

comment on function public.resolve_ingredient_food_fuzzy(text) is
  'Trigram-fuzzy foods.name resolver. Called by apps/web/src/lib/foods/resolve-ingredient.ts pass 4. Returns at most one row (the best-similarity foods.name hit) with the id + similarity score. Sort order matches v0.5.7 route.ts JS re-rank: is_canonical desc, rank_penalty asc, similarity desc. Missing before mig 029.';

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Both RPCs are read-only. authenticated + anon can call them; RLS on
-- foods + food_aliases still restricts what they can select.
grant execute on function public.resolve_ingredient_alias_fuzzy(text) to anon, authenticated;
grant execute on function public.resolve_ingredient_food_fuzzy(text) to anon, authenticated;
