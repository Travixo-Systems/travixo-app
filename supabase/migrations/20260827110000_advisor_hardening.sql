-- ============================================================
-- 20260827_advisor_hardening.sql
--
-- Closes the remaining Supabase security-advisor findings.
--
-- Context
-- -------
-- 20260819_assets_rls_and_public_scan_view.sql deliberately left
-- public.asset_categories alone, with a note to "scope it the same way as
-- assets in a follow-up". This is that follow-up.
--
-- Measured live state before this migration (scripts/verify-advisor-fixes.mjs):
--   * anon SELECT on asset_categories returned rows and enumerated 11
--     organization_id values.
--   * anon INSERT into asset_categories SUCCEEDED (HTTP 201). The table was
--     writable by unauthenticated callers, not merely readable.
--   * 67 category rows across 12 organizations; 0 rows with a NULL
--     organization_id, so a strict org-scoped policy strands nothing.
--
-- What this migration does NOT change
-- -----------------------------------
--   * public.get_asset_by_qr stays SECURITY DEFINER and stays executable by
--     anon. It LEFT JOINs asset_categories to return category_name on the
--     public scan page. Because it is SECURITY DEFINER, that join keeps
--     working after RLS is enabled. Revoking it would break the QR scan.
--   * The `*_insert_during_signup` policies on users/organizations are left
--     as-is. They are WITH CHECK (true) by design: a brand-new account has no
--     organization to be scoped against yet.
--   * subscription_plans stays anon-readable. It is public pricing shown
--     before signup.
-- ============================================================

-- ------------------------------------------------------------
-- 1. public.asset_categories -- enable RLS and scope to the org.
--
--    Mirrors the assets policies exactly (membership resolved through
--    users.organization_id) so there is one tenancy mechanism, not two.
-- ------------------------------------------------------------
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_categories_select_same_org" ON public.asset_categories;
CREATE POLICY "asset_categories_select_same_org"
  ON public.asset_categories
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

-- INSERT matters here: the browser-side import modal creates categories
-- (components/assets/ImportAssetsModal.tsx). Without this policy, imports
-- would still "succeed" but silently land every asset uncategorised.
DROP POLICY IF EXISTS "asset_categories_insert_same_org" ON public.asset_categories;
CREATE POLICY "asset_categories_insert_same_org"
  ON public.asset_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "asset_categories_update_same_org" ON public.asset_categories;
CREATE POLICY "asset_categories_update_same_org"
  ON public.asset_categories
  FOR UPDATE
  TO authenticated
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

DROP POLICY IF EXISTS "asset_categories_delete_same_org" ON public.asset_categories;
CREATE POLICY "asset_categories_delete_same_org"
  ON public.asset_categories
  FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

-- Belt and braces: RLS governs row visibility, but the anon role should not
-- hold table privileges on a tenant table in the first place.
REVOKE ALL ON public.asset_categories FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_categories TO authenticated;

COMMENT ON TABLE public.asset_categories IS
  'Per-organization asset category labels. RLS: same-org authenticated '
  'members only. Read by the public scan page indirectly through '
  'get_asset_by_qr, which is SECURITY DEFINER and unaffected by these policies.';

-- ------------------------------------------------------------
-- 2. Revoke anon EXECUTE on privileged SECURITY DEFINER functions.
--
--    A SECURITY DEFINER function runs with the definer's rights and bypasses
--    RLS, so anon must not be able to call one that mutates state or reveals
--    another org's counts.
--
--    Measured: extend_trial and create_trial_subscription were already
--    unreachable for anon (401/404). check_asset_limit and
--    check_pilot_asset_limit answered anon with HTTP 200 and returned
--    quota data for a caller-supplied org id.
--
--    checkout_asset and create_organization_and_user are called only from
--    authenticated contexts:
--      * app/api/rentals/checkout/route.ts authenticates (401) and derives
--        organization_id server-side before the RPC.
--      * app/(auth)/confirm/page.tsx calls verifyOtp() first, so a session
--        exists by the time create_organization_and_user runs.
--    Both keep EXECUTE for `authenticated` and lose it for `anon`.
-- ------------------------------------------------------------
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'check_asset_limit',
        'check_pilot_asset_limit',
        'checkout_asset',
        'return_asset',
        'create_organization_and_user',
        'create_trial_subscription',
        'extend_trial',
        'set_feature_flag',
        'generate_vgp_alerts',
        'resolve_vgp_alerts_on_completion',
        'update_vgp_schedule_after_inspection',
        'calculate_vgp_due_date',
        'has_feature_access',
        'is_pilot_active',
        'get_my_organization_id'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, public;', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', fn.sig);
  END LOOP;
END
$$;

-- get_asset_by_qr is the deliberate exception: the public QR scan page calls
-- it without a session. Re-assert the grant so ordering can never strip it.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_asset_by_qr'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated;', fn.sig);
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 3. Pin search_path on functions flagged as mutable.
--
--    A SECURITY DEFINER function without a fixed search_path can be steered
--    into resolving an unqualified name against an attacker-controlled
--    schema. Setting it is a no-op for behaviour when the body already uses
--    public.* names.
-- ------------------------------------------------------------
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%'
      ))
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, pg_temp;',
      fn.sig
    );
  END LOOP;
END
$$;
