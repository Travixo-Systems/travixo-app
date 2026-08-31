-- ============================================================
-- Applies ONLY the piece that did not take: enabling RLS.
--
-- Verification after the first run showed get_asset_by_qr installed and
-- working, but anon could still read all 2702 assets and 327 scans --
-- i.e. the ALTER TABLE ... ENABLE ROW LEVEL SECURITY statements did not
-- take effect (most likely only part of the script was executed).
--
-- Safe to run on its own, and safe to re-run. It re-creates the policies
-- first so RLS is never enabled without them (which would break the
-- authenticated dashboard reads).
--
-- After running, verify with:  node scripts/verify-assets-rls.mjs
-- ============================================================

-- --- assets: policies first, then enable ---------------------
DROP POLICY IF EXISTS "assets_select_same_org" ON public.assets;
CREATE POLICY "assets_select_same_org"
  ON public.assets FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assets_insert_same_org" ON public.assets;
CREATE POLICY "assets_insert_same_org"
  ON public.assets FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assets_update_same_org" ON public.assets;
CREATE POLICY "assets_update_same_org"
  ON public.assets FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assets_delete_same_org" ON public.assets;
CREATE POLICY "assets_delete_same_org"
  ON public.assets FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- --- scans: policies first, then enable ----------------------
DROP POLICY IF EXISTS "scans_select_same_org" ON public.scans;
CREATE POLICY "scans_select_same_org"
  ON public.scans FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = scans.asset_id
        AND a.organization_id IN (
          SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
        )
    )
  );

-- Anonymous QR scan logging must keep working: /api/scan/update writes
-- with the ANON-key SSR client and swallows insert errors, so without
-- this policy public scan logging would fail silently.
DROP POLICY IF EXISTS "scans_insert_public_qr_log" ON public.scans;
CREATE POLICY "scans_insert_public_qr_log"
  ON public.scans FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = scans.asset_id
        AND a.archived_at IS NULL
    )
    AND (scanned_by IS NULL OR scanned_by = auth.uid())
  );

ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

-- --- confirm, in the same run --------------------------------
SELECT
  c.relname             AS table_name,
  c.relrowsecurity      AS rls_enabled,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('assets', 'scans')
ORDER BY c.relname;
