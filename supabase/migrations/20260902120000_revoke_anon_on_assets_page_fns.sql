-- 20260902120000_revoke_anon_on_assets_page_fns.sql
--
-- Take EXECUTE away from anon on the three assets-page functions.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS NEEDED AT ALL
-- ---------------------------------------------------------------------------
-- 20260902100000 created assets_page, assets_status_counts and
-- assets_category_counts, granting EXECUTE only to authenticated and
-- service_role, and revoking from PUBLIC.
--
-- That was not enough. Verified against the live schema afterwards:
--
--   GRANT EXECUTE ON FUNCTION public.assets_page(...) TO "anon", "authenticated", ...
--
-- anon holds EXECUTE despite never being granted it, because of
-- supabase/schemas/public/default_privileges.sql:
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO "anon";
--
-- Every new function in public is handed to anon automatically. REVOKE ... FROM
-- PUBLIC does not undo that: PUBLIC and anon are different grantees, so
-- revoking one leaves the other in place.
--
-- This is the same lesson as 20260827 advisor_hardening, arriving from a
-- different direction. That migration cleaned up functions whose grants were
-- wiped by CREATE OR REPLACE; this one covers functions that were born with a
-- grant nobody wrote.
--
-- ---------------------------------------------------------------------------
-- IMPACT WHILE anon COULD CALL THEM
-- ---------------------------------------------------------------------------
-- No data was exposed. All three scope through get_my_organization_id(), which
-- reads auth.uid() and returns NULL without a session, so every predicate
-- became `organization_id = NULL` and matched nothing. Probed as anon:
--
--   assets_status_counts   -> []
--   assets_category_counts -> []
--   assets_page            -> []
--
-- The functions answered 200 with an empty array rather than refusing. That is
-- defence by predicate, which works, but it is one edit away from not working:
-- anything that later makes the org id resolvable without a session turns an
-- empty list into a full one. Revoking makes the refusal explicit.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.assets_status_counts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.assets_category_counts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.assets_page(TEXT, TEXT, UUID, BOOLEAN, INTEGER, INTEGER) FROM anon;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. anon is gone from the grant list. Expect authenticated, postgres and
--    service_role only:
--
--   SELECT p.proname,
--          array_to_string(p.proacl, E'\n') AS acl
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('assets_page','assets_status_counts','assets_category_counts');
--
-- 2. An anonymous call is refused outright rather than returning an empty set:
--
--   curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/assets_status_counts" \
--     -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{}'
--
--   Expect 401 / "permission denied for function", not [].
--
-- 3. An authenticated caller is unaffected. For a EuroRent member on
--    2026-09-02 that was 304 available, 114 in_use, 71 maintenance:
--
--   SELECT * FROM public.assets_status_counts();
--
-- ---------------------------------------------------------------------------
-- FOR ANY FUNCTION ADDED LATER
-- ---------------------------------------------------------------------------
-- Granting only to authenticated is not sufficient in this project. A new
-- function in public is granted to anon by default privileges, so it must
-- explicitly REVOKE EXECUTE ... FROM anon as well. Recorded in
-- docs/working-agreements.md.
