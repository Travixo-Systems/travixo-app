-- ============================================================
-- Drop the permissive public policies that keep assets/scans open
--
-- Written for the team, so it says plainly what was wrong.
--
-- CONTEXT
--   20260819 enabled RLS on assets and scans and added org-scoped
--   policies, but anon could still read every row. Cause: Postgres OR's
--   PERMISSIVE policies together, and pg_policies showed pre-existing
--   dashboard-created policies granting role {public} -- which includes
--   anon -- with USING (true):
--
--     assets_select_public   SELECT  {public}  USING (true)
--     assets_update_public   UPDATE  {public}  USING (true) CHECK (true)
--     public_view_scans      SELECT  {public}  USING (true)
--
--   assets_update_public is the most serious: verified on 2026-08-20 that
--   an anonymous PATCH is authorized (HTTP 200 against a real row, which
--   left the value unchanged only because RLS then matched nothing after
--   the drop). Before the drop, anyone holding the public anon key could
--   rewrite name/status/location on any asset in any org.
--
--   Also dropped: two redundant blanket INSERT policies on scans that
--   allow anon to insert arbitrary rows with WITH CHECK (true):
--
--     "Allow public insert for scans"  INSERT {public} CHECK (true)
--     public_insert_scans              INSERT {public} CHECK (true)
--
--   Anonymous QR logging keeps working via scans_insert_public_qr_log
--   (added in 20260819), which is constrained: the row must reference a
--   real non-archived asset and may not attribute itself to another user.
--
-- KEPT DELIBERATELY
--   Older {public} policies whose USING clause is already org-scoped are
--   left alone. They are redundant with the 20260819 policies but not
--   harmful: an anonymous caller has auth.uid() = NULL, so
--   `organization_id IN (SELECT ... WHERE users.id = auth.uid())` matches
--   nothing. Removing duplicates is a separate cleanup -- this migration
--   only removes what actually grants public access.
--
--   super_admin_read_all_assets is kept (USING is_super_admin()).
--
-- STATUS: APPLIED to production 2026-08-20 and verified. Anonymous read
-- returns zero rows on both tables, and an anonymous write against a real
-- row was confirmed to leave the value unchanged.
--
-- IDEMPOTENT: safe to re-run.
--
-- NO ROLLBACK SCRIPT: the policies dropped here granted the public role
-- unconditional read and write on the fleet. Recreating them is never the
-- right move.
-- ============================================================

-- --- assets --------------------------------------------------
-- Full public read of every asset (purchase_price, current_value, ...).
DROP POLICY IF EXISTS "assets_select_public" ON public.assets;

-- Full public WRITE on every asset. Verified anon-authorized.
DROP POLICY IF EXISTS "assets_update_public" ON public.assets;

-- --- scans ---------------------------------------------------
-- Full public read of movement history (location_name / lat / lng /
-- scanned_by).
DROP POLICY IF EXISTS "public_view_scans" ON public.scans;

-- Unconstrained public INSERT. Superseded by scans_insert_public_qr_log.
DROP POLICY IF EXISTS "Allow public insert for scans" ON public.scans;
DROP POLICY IF EXISTS "public_insert_scans" ON public.scans;

-- --- confirm, in the same run --------------------------------
-- Expect zero rows: no remaining policy should grant {public}/{anon}
-- unconditional access. (scans_insert_public_qr_log is intentionally
-- {anon,authenticated} but its WITH CHECK is constrained, so it is
-- excluded by the qual/with_check = 'true' test below.)
SELECT
  tablename,
  policyname,
  cmd,
  roles::text AS applies_to,
  qual        AS using_expr,
  with_check  AS check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('assets', 'scans')
  AND (roles::text LIKE '%public%' OR roles::text LIKE '%anon%')
  AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename, policyname;
