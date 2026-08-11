-- 026_security_advisor_fixes.sql — pick up the safe Splinter security-advisor findings.
-- Applied 2026-08-11.
--
-- Findings addressed (via the Management API's /database/query lint pass):
--   1. `set_updated_at()` — trigger function with a mutable search_path is
--      a classic privilege-escalation vector if a schema is inserted higher
--      in the resolution order. Locking it to `public, pg_temp` is the
--      standard PG hardening (matches what supabase/auth trigger functions
--      already do).
--   2. `push_broadcasts` + `push_deliveries` — RLS enabled but with ZERO
--      policies means "no rows visible to any authenticated user," which
--      is what we want (only sysadmin / service-role writes). But Splinter
--      flags this as `rls_enabled_no_policy` INFO because the intent is
--      not documented in-schema. Add an explicit "no access for anon/
--      authenticated" policy per table so the intent is legible in the
--      schema, not just in a code comment somewhere.
--
-- NOT addressed here (needs its own migration):
--   • `pg_trgm` extension is installed in `public` schema (Splinter WARN
--     `extension_in_public`). Moving it requires dropping and recreating
--     every GIN trigram index on `foods` (see migration 018 + 023). That
--     is a v0.5.6 task — done here it risks breaking food search mid-flight.
--
-- Idempotency: every DDL uses `create or replace` / `if not exists` /
-- `drop policy if exists` so re-runs are safe.

-- 1. set_updated_at — lock search_path
create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger helper: bumps updated_at to now() on row update. search_path is pinned to public + pg_temp so a rogue schema cannot shadow now() or the assignment target.';

-- 2. push_broadcasts — deny-by-default policy for anon + authenticated
drop policy if exists push_broadcasts_no_direct_access on public.push_broadcasts;
create policy push_broadcasts_no_direct_access
  on public.push_broadcasts
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on policy push_broadcasts_no_direct_access on public.push_broadcasts is
  'Reads + writes happen only via service_role (broadcast-release GH Action + scripts/broadcast-release.mjs). No end-user endpoint touches this table. Explicit deny documents that intent for future readers + silences Splinter rls_enabled_no_policy.';

-- 3. push_deliveries — same treatment
drop policy if exists push_deliveries_no_direct_access on public.push_deliveries;
create policy push_deliveries_no_direct_access
  on public.push_deliveries
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on policy push_deliveries_no_direct_access on public.push_deliveries is
  'Reads + writes happen only via service_role (broadcast-release workflow tracks per-endpoint success/failure). Explicit deny documents that intent for future readers + silences Splinter rls_enabled_no_policy.';
