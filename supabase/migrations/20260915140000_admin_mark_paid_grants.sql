-- 20260915140000_admin_mark_paid_grants.sql
--
-- Narrow EXECUTE on public.admin_mark_paid to match its three siblings.
--
-- ---------------------------------------------------------------------------
-- WHAT IS WRONG
-- ---------------------------------------------------------------------------
-- The four platform-admin functions were granted inconsistently:
--
--   extend_trial      authenticated, postgres, service_role  + REVOKE FROM PUBLIC
--   set_feature_flag  authenticated, postgres, service_role  + REVOKE FROM PUBLIC
--   end_pilot         anon, authenticated, postgres, service_role + REVOKE FROM PUBLIC
--   admin_mark_paid   PUBLIC, anon, authenticated, postgres, service_role
--                     -- and NO revoke at all
--
-- admin_mark_paid is the one that sets converted_to_paid, the flag the app and
-- every revenue figure read as "this customer pays us". It is the only one of
-- the four an anonymous caller may invoke, which is exactly backwards.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES AND DOES NOT FIX
-- ---------------------------------------------------------------------------
-- This is defence in depth, not a plugged hole. The function's first statement
-- is `IF NOT public.is_super_admin() THEN RAISE not_authorized`, and
-- is_super_admin() reads auth.uid() against public.platform_admins. An anon
-- caller has no auth.uid(), so the write was already refused. Nothing was
-- exploitable through this grant.
--
-- What it removes is the ability to REACH the function at all from an
-- unauthenticated session. A caller who cannot execute it cannot probe it,
-- cannot time it, and cannot benefit from a future edit that moves a statement
-- above the authorisation check. The other three already work this way; this
-- brings the most consequential one in line.
--
-- end_pilot's `anon` grant is left alone deliberately: this migration is about
-- the function with no revoke at all. Narrowing end_pilot is worth doing and is
-- not bundled here, so that this change stays reviewable as one idea.
--
-- ---------------------------------------------------------------------------
-- CALLERS
-- ---------------------------------------------------------------------------
-- One, and it is authenticated:
--   app/(admin)/admin/orgs/[id]/actions.ts:183
--     supabase.rpc('admin_mark_paid', ...) through the cookie-bound client,
--     after requireSuperAdmin(). That client authenticates as `authenticated`,
--     which this migration keeps.
-- No cron, no webhook, no script, and no service-role caller invokes it.
-- service_role is retained regardless, for SQL-editor and support use.
--
-- REVERSIBILITY: re-granting is a one-line GRANT. No data is touched.

BEGIN;

REVOKE ALL ON FUNCTION public.admin_mark_paid(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mark_paid(UUID, TEXT, TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_mark_paid(UUID, TEXT, TEXT)
  TO authenticated, postgres, service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (run after applying)
-- ---------------------------------------------------------------------------
--   SELECT proacl FROM pg_proc WHERE proname = 'admin_mark_paid';
--
-- Expect no '=X/' entry (PUBLIC) and no 'anon=X/' entry; expect
-- 'authenticated=X/', 'postgres=X/' and 'service_role=X/'.
--
-- Then refresh the mirror, per AGENTS.md:
--   npx supabase db pull --declarative
