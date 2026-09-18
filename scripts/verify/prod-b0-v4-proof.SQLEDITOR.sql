-- ===========================================================================
-- B0 (C-3) BEHAVIOUR PROOF — PRODUCTION
-- ===========================================================================
-- Paste into: Supabase Dashboard -> SQL Editor -> New query -> Run each block.
--
-- B0 (migration 20260918140000) is live. The mirror pull proves the FUNCTION
-- BODY is correct. This proves it BEHAVES: a real authenticated session in one
-- tenant cannot return another tenant's rental.
--
-- SAFETY
--   Every mutating block is BEGIN ... ROLLBACK. Nothing is committed.
--   Targets are the ZZ-LOADTEST synthetic orgs only:
--     ZZ-LOADTEST-1  e9248833-65db-43ad-b0cb-c76d58fd9abb
--     ZZ-LOADTEST-2  b35d5605-6cbb-4977-8d11-fa312a90bc38
--
-- READING THE RESULT
--   V4      expect  {"success": false, "error": "rental_not_found"}
--           success:true = FAIL, B0 did not block the cross-tenant call.
--   CONTROL expect  {"success": true, "scan_id": "..."}
--           If the control fails too, the V4 "pass" is meaningless -- it would
--           only show the session cannot return ANYTHING.
-- ===========================================================================


-- STEP 0 --------------------------------------------------------------------
-- Find a ZZ-LOADTEST-1 user and an ACTIVE rental in each org.
-- If either org has no active rental, the proof cannot run as written.
SELECT 'zz1_user' AS what, u.id::text AS id, NULL::text AS extra
FROM public.users u
WHERE u.organization_id = 'e9248833-65db-43ad-b0cb-c76d58fd9abb'
ORDER BY u.created_at LIMIT 3

UNION ALL
SELECT 'zz1_active_rental', r.id::text, 'asset=' || r.asset_id::text
FROM public.rentals r
WHERE r.organization_id = 'e9248833-65db-43ad-b0cb-c76d58fd9abb'
  AND r.status = 'active'
LIMIT 3

UNION ALL
SELECT 'zz2_active_rental', r.id::text, 'asset=' || r.asset_id::text
FROM public.rentals r
WHERE r.organization_id = 'b35d5605-6cbb-4977-8d11-fa312a90bc38'
  AND r.status = 'active'
LIMIT 3;


-- ===========================================================================
-- V4 — THE FINDING. ZZ-1 user attempts to return a ZZ-2 rental.
-- Substitute <ZZ1_USER> and <ZZ2_RENTAL> from STEP 0.
-- EXPECT: {"success": false, "error": "rental_not_found"}
-- ===========================================================================
/*
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<ZZ1_USER>","role":"authenticated"}';

  -- Prove the target rental exists and is active, so a "not found" result is
  -- B0 refusing rather than the row simply being absent.
  SELECT id, status, organization_id
  FROM public.rentals WHERE id = '<ZZ2_RENTAL>';

  SELECT public.return_asset(
    '<ZZ2_RENTAL>'::uuid,
    '<ZZ1_USER>'::uuid,
    'good', 'b0 cross-tenant proof', NULL, NULL, NULL
  ) AS v4_result;
ROLLBACK;
*/


-- ===========================================================================
-- CONTROL — same user returns their OWN org's rental.
-- EXPECT: {"success": true, "scan_id": "..."}
-- ===========================================================================
/*
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<ZZ1_USER>","role":"authenticated"}';

  SELECT public.return_asset(
    '<ZZ1_RENTAL>'::uuid,
    '<ZZ1_USER>'::uuid,
    'good', 'b0 same-tenant control', NULL, NULL, NULL
  ) AS control_result;

  -- Attribution must be the caller, not whatever p_user_id said.
  SELECT returned_by FROM public.rentals WHERE id = '<ZZ1_RENTAL>';
ROLLBACK;
*/


-- ===========================================================================
-- ATTRIBUTION — caller passes someone else's uuid as p_user_id.
-- EXPECT: returned_by = <ZZ1_USER>, NOT the id passed in.
-- ===========================================================================
/*
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<ZZ1_USER>","role":"authenticated"}';

  SELECT public.return_asset(
    '<ZZ1_RENTAL>'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,   -- deliberately wrong
    'good', 'b0 attribution proof', NULL, NULL, NULL
  );

  SELECT returned_by AS should_equal_zz1_user
  FROM public.rentals WHERE id = '<ZZ1_RENTAL>';
ROLLBACK;
*/
