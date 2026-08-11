-- 031_handle_new_user_revoke.sql — revoke direct EXECUTE on the auth trigger fn.
-- Applied 2026-08-11.
--
-- Splinter findings (0028 + 0029):
--   `public.handle_new_user()` is SECURITY DEFINER (it must be, so it can
--   INSERT into public.profiles on behalf of a freshly-authed user), and
--   EXECUTE is currently granted to anon, authenticated, PUBLIC — which
--   means anyone can call `POST /rest/v1/rpc/handle_new_user` and cause a
--   privileged INSERT into public.profiles with any auth.uid() they pass
--   as the trigger's `new`. Splinter correctly flags this as
--   `anon_security_definer_function_executable` +
--   `authenticated_security_definer_function_executable`.
--
--   The function is only meant to be called by the
--   `on_auth_user_created` trigger on `auth.users`. Triggers execute
--   under the table owner's privileges regardless of who inserted the
--   row, so REVOKE'ing EXECUTE from anon/authenticated/PUBLIC does not
--   break the trigger — it only closes off the PostgREST-exposed direct
--   RPC call.
--
--   Verified: `select tgname from pg_trigger where tgfoid = ... 'handle_new_user'`
--   returns `on_auth_user_created` on `auth.users`, and no other caller
--   exists in the codebase.
--
-- Also: pin search_path (defense in depth — it was `public` but no
-- pg_temp guard). Matches the v0.5.5 hardening for `set_updated_at`.

-- Existing grants (from pre-migration audit):
--   service_role  · authenticated  · anon  · postgres  · PUBLIC
-- Target state:
--   service_role  · postgres
-- (Trigger doesn't need explicit grant — runs under the table owner.)

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- Re-issue explicit grants to the two roles that legitimately might call
-- it (service_role for admin flows, postgres for the trigger owner —
-- redundant but explicit). No-op if already present.
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.handle_new_user() to postgres;

-- Search-path hardening (matches set_updated_at pattern from mig 026).
alter function public.handle_new_user() set search_path = public, pg_temp;

comment on function public.handle_new_user() is
  'Auth trigger — inserts a profiles row on new auth.users signup. SECURITY DEFINER (required for cross-schema insert). EXECUTE revoked from anon+authenticated+PUBLIC since v0.5.10 (Splinter 0028/0029) so the PostgREST-exposed RPC endpoint refuses direct calls. Only the on_auth_user_created trigger and service_role can invoke it.';
