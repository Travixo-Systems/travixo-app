-- ============================================================================
-- B0 follow-up: narrow return_asset() grants to authenticated only
-- ============================================================================
--
-- GRANTS ONLY. No function body is changed, no policy is touched.
--
-- WHY THIS IS NEEDED
--
--   B0 (20260916133224... applied as 20260918140000) intended
--   `authenticated` only, and its migration carried:
--
--     REVOKE ALL ON FUNCTION public.return_asset(...) FROM PUBLIC, anon;
--     GRANT  EXECUTE ON FUNCTION public.return_asset(...)
--       TO authenticated, postgres, service_role;
--
--   The schema pulled from production after that push still reads:
--
--     GRANT EXECUTE ON FUNCTION "public"."return_asset"(...)
--       TO "authenticated", "postgres", "service_role";
--
--   REVOKE strips only the roles it NAMES, and CREATE OR REPLACE preserves the
--   existing ACL, so revoking PUBLIC and anon left service_role and postgres
--   exactly as they were. The same mistake was caught and corrected in B1
--   before it shipped; this brings return_asset into line.
--
--   anon was already absent from return_asset, so nothing anonymous is
--   affected.
--
-- WHY DROPPING service_role IS SAFE
--
--   After B0 the function derives its organisation from
--   get_my_organization_id(), which reads public.users by auth.uid().
--   service_role has no public.users row, so v_org is NULL and B0 already
--   returns rental_not_found for it. The grant permits a call that the body
--   then refuses -- removing it makes the permission match the behaviour.
--
--   The only call site is app/api/rentals/return/route.ts:38, which uses the
--   anon-key session client (@/lib/supabase/server) and therefore runs as
--   `authenticated`. Verified with
--   `git grep "rpc('return_asset'"` -- one hit, no service client.
--
--   postgres keeps effective access as owner/superuser whatever the ACL says;
--   revoking the explicit grant only stops it being a granted path.
--
-- EXPECTED RESULT
--
--   proacl becomes exactly:  {authenticated=X/postgres}
--
-- Rollback SQL is at the foot of this file.
-- ============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.return_asset(uuid, uuid, text, text, text, double precision, double precision)
  FROM PUBLIC, anon, service_role, postgres;

GRANT EXECUTE ON FUNCTION public.return_asset(uuid, uuid, text, text, text, double precision, double precision)
  TO authenticated;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Restores the grants exactly as production carried them before this
-- migration. The function body is untouched either way.
--
--   BEGIN;
--   GRANT EXECUTE ON FUNCTION public.return_asset(uuid, uuid, text, text, text, double precision, double precision)
--     TO authenticated, postgres, service_role;
--   COMMIT;
-- ============================================================================
