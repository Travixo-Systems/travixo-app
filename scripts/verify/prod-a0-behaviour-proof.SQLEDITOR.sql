-- ===========================================================================
-- A0 BEHAVIOUR PROOF — PRODUCTION
-- ===========================================================================
-- Paste into: Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- WHAT THIS IS
--   A0 (migration 20260916133224) is live in production. The pg_trigger query
--   proved the trigger EXISTS and is INVOKER. This proves it BEHAVES: that a
--   real authenticated session is actually refused.
--
-- SAFETY
--   Everything runs inside BEGIN ... ROLLBACK. Nothing is committed. The two
--   UPDATEs are expected to raise, which aborts the transaction anyway; the
--   explicit ROLLBACK is belt and braces.
--
--   Targets are the ZZ-LOADTEST synthetic orgs, never a customer tenant:
--     ZZ-LOADTEST-1  e9248833-65db-43ad-b0cb-c76d58fd9abb
--     ZZ-LOADTEST-2  b35d5605-6cbb-4977-8d11-fa312a90bc38
--
-- READING THE RESULT — this matters
--   ERROR: users_identity_invariant...  -> PASS. The guard fired.
--   UPDATE 1                            -> FAIL. A0 did not block the write.
--   UPDATE 0                            -> INVALID TEST, not a pass. The
--                                          statement matched no row, so the
--                                          trigger was never reached and the
--                                          run proves nothing. Fix the uuid
--                                          and re-run.
--
--   Step 0 exists to make UPDATE 0 impossible to mistake for success: it
--   prints the row the test will target. If it returns nothing, stop.
-- ===========================================================================


-- STEP 0 --------------------------------------------------------------------
-- Pick a real member of ZZ-LOADTEST-1 and confirm the row exists.
-- Copy the user_id it returns into STEP 1 and STEP 2 below.
SELECT
  u.id   AS user_id,
  u.role AS current_role,
  u.organization_id AS current_org
FROM public.users u
WHERE u.organization_id = 'e9248833-65db-43ad-b0cb-c76d58fd9abb'
ORDER BY u.created_at
LIMIT 5;


-- ===========================================================================
-- STEP 1 — tenant move: own organization_id -> ZZ-LOADTEST-2
-- Replace <ZZ1_USER_UUID> with a user_id from STEP 0, then run this block.
-- EXPECT: ERROR users_identity_invariant ... own organization_id
-- ===========================================================================
/*
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<ZZ1_USER_UUID>","role":"authenticated"}';

  -- Guard against the UPDATE 0 trap: this must return 1.
  SELECT count(*) AS rows_the_update_will_match
  FROM public.users WHERE id = '<ZZ1_USER_UUID>';

  UPDATE public.users
     SET organization_id = 'b35d5605-6cbb-4977-8d11-fa312a90bc38'
   WHERE id = '<ZZ1_USER_UUID>';
ROLLBACK;
*/


-- ===========================================================================
-- STEP 2 — self role escalation: own role -> owner
-- EXPECT: ERROR users_identity_invariant ... own role
-- ===========================================================================
/*
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<ZZ1_USER_UUID>","role":"authenticated"}';

  SELECT count(*) AS rows_the_update_will_match
  FROM public.users WHERE id = '<ZZ1_USER_UUID>';

  UPDATE public.users
     SET role = 'owner'
   WHERE id = '<ZZ1_USER_UUID>';
ROLLBACK;
*/


-- ===========================================================================
-- STEP 3 — negative control. Proves the session can still write legitimately,
-- so a DENY above is A0 refusing, not the session being inert.
-- EXPECT: UPDATE 1, no error.
-- ===========================================================================
/*
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<ZZ1_USER_UUID>","role":"authenticated"}';

  UPDATE public.users
     SET first_name = 'a0-control-' || to_char(now(), 'HH24MISS')
   WHERE id = '<ZZ1_USER_UUID>';

  SELECT first_name FROM public.users WHERE id = '<ZZ1_USER_UUID>';
ROLLBACK;
*/
