-- ============================================================
-- Close anonymous read access to public.assets and public.scans
--
-- Written for the team, so it says plainly what was wrong.
--
-- PROBLEM
--   A live RLS coverage sweep of all 23 PostgREST-exposed tables
--   (2026-08-19) found exactly two tenant tables readable with nothing
--   but the public anon key, which ships in the client JS bundle:
--
--     assets : 2702 / 2702 rows  (2642 non-demo, 2549 with a price)
--     scans  :  327 /  327 rows  (310 location_name, 311 scanned_by,
--                                 6 latitude/longitude pairs)
--
--   No QR code is required -- a bare `GET /rest/v1/assets?select=*`
--   returns the whole fleet across every organization, including
--   purchase_price, current_value, current_location and organization_id.
--   `scans` additionally exposes per-machine movement history: where a
--   given asset was scanned, when, by which user id, and GPS coordinates.
--
--   (Row payloads are capped at PostgREST's max-rows of 1000, so an
--   attacker paginates; the exact counts above come from count headers.)
--
--   Every other tenant table -- clients, rentals, organizations, audits,
--   users, subscriptions, vgp_* -- correctly returns 0 rows for anon.
--   asset_categories (38 rows: label + org id) and subscription_plans
--   (4 rows: public pricing) are also anon-readable but are not treated
--   as exposures here; see the note at the end of this file.
--
--   The public QR scan page (app/scan/[qr_code]/page.tsx) depends on the
--   open read: it queried `assets` directly with `select('*')`. RLS
--   therefore cannot simply be switched on -- the page needs a narrow
--   public read path, which section 3 provides.
--
-- APPROACH
--   1. Enable RLS on assets.
--   2. Org-scoped policies for authenticated members (SELECT/INSERT/
--      UPDATE/DELETE), matching how clients/rentals are already scoped.
--      The existing super_admin_read_all_assets policy is left in place;
--      permissive SELECT policies are OR'd, so admin access is unaffected.
--   3. A SECURITY DEFINER function for the public scan lookup that
--      returns ONLY display-safe columns for ONE qr_code. Purchase price,
--      current value, and organization_id are never returned to anon.
--   4. Same treatment for `scans`, scoped through the parent asset.
--      IMPORTANT: anonymous QR scan logging must keep working, so an
--      anon INSERT policy is included -- see section 4 for why.
--
-- STATUS: APPLIED to production 2026-08-19/20 and verified.
--
-- IDEMPOTENT: safe to re-run. Verify with scripts/verify-assets-rls.mjs.
--
-- NO ROLLBACK SCRIPT: reverting this would reopen public read/write on
-- the fleet, and it could not restore the dashboard-created policies that
-- 20260820_drop_permissive_public_policies.sql removed anyway.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Enable RLS
-- ------------------------------------------------------------
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. Org-scoped access for authenticated members.
--
--    Membership is resolved through users.organization_id, the same
--    mechanism the existing tenant policies use.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "assets_select_same_org" ON public.assets;
CREATE POLICY "assets_select_same_org"
  ON public.assets
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assets_insert_same_org" ON public.assets;
CREATE POLICY "assets_insert_same_org"
  ON public.assets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assets_update_same_org" ON public.assets;
CREATE POLICY "assets_update_same_org"
  ON public.assets
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

DROP POLICY IF EXISTS "assets_delete_same_org" ON public.assets;
CREATE POLICY "assets_delete_same_org"
  ON public.assets
  FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 3. Public scan lookup.
--
--    SECURITY DEFINER so it can read past RLS, but it returns a fixed
--    narrow column list for a SINGLE qr_code. Deliberately absent:
--    purchase_price, current_value, organization_id, last_seen_by,
--    archive metadata, is_demo_data.
--
--    purchase_date is included but NULLed for anon callers -- an
--    authenticated same-org member gets the real value, so one function
--    serves both the public and logged-in scan views.
--
--    Archived assets are treated as not found.
--
--    NOTE: name/serial_number/status/current_location/category_name are
--    `character varying` in the live schema, so each is cast to text to
--    match RETURNS TABLE. Without the casts Postgres raises
--    "structure of query does not match function result type" at call time.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_asset_by_qr(text);
CREATE OR REPLACE FUNCTION public.get_asset_by_qr(p_qr_code text)
RETURNS TABLE (
  id uuid,
  name text,
  serial_number text,
  status text,
  current_location text,
  description text,
  purchase_date date,
  last_seen_at timestamptz,
  category_name text,
  viewer_is_member boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    a.id,
    a.name::text,
    a.serial_number::text,
    a.status::text,
    a.current_location::text,
    a.description::text,
    -- financial/date detail only for same-org authenticated members
    CASE
      WHEN a.organization_id IN (
        SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
      ) THEN a.purchase_date
      ELSE NULL
    END AS purchase_date,
    a.last_seen_at,
    c.name::text AS category_name,
    (
      a.organization_id IN (
        SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
      )
    ) IS TRUE AS viewer_is_member
  FROM public.assets a
  LEFT JOIN public.asset_categories c ON c.id = a.category_id
  WHERE a.qr_code = p_qr_code
    AND a.archived_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_asset_by_qr(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_asset_by_qr(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_asset_by_qr(text) IS
  'Public QR scan lookup. Returns display-safe columns for one asset. '
  'Never returns purchase_price, current_value, or organization_id. '
  'purchase_date is NULL unless the caller is an authenticated same-org member.';

-- ------------------------------------------------------------
-- 4. public.scans
--
--    `scans` has no organization_id of its own; tenancy is inherited
--    from the parent asset, so every policy joins through assets.
--
--    READ: same-org members only. This closes the movement-history
--    leak (location_name / lat / lng / scanned_by per asset).
--
--    INSERT: anon is deliberately still allowed. app/api/scan/update
--    logs every QR scan -- including scans by logged-out users on a
--    chantier -- and it runs `createClient()` from lib/supabase/server,
--    which is the ANON-key SSR client, not the service role. Without an
--    anon INSERT policy, RLS would silently break public scan logging
--    (the route already swallows scanError and only console.errors it,
--    so this would fail invisibly in production).
--
--    The INSERT policy is constrained: the row must point at a real,
--    non-archived asset, and an anonymous insert may not attribute
--    itself to a user (scanned_by must be null unless it matches the
--    caller). Anon still cannot read back what it wrote.
-- ------------------------------------------------------------
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scans_select_same_org" ON public.scans;
CREATE POLICY "scans_select_same_org"
  ON public.scans
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assets a
      WHERE a.id = scans.asset_id
        AND a.organization_id IN (
          SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "scans_insert_public_qr_log" ON public.scans;
CREATE POLICY "scans_insert_public_qr_log"
  ON public.scans
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.assets a
      WHERE a.id = scans.asset_id
        AND a.archived_at IS NULL
    )
    AND (scanned_by IS NULL OR scanned_by = auth.uid())
  );

-- ------------------------------------------------------------
-- NOTE on the two remaining anon-readable tables (intentional):
--
--   subscription_plans (4 rows) -- public pricing, shown pre-signup.
--   asset_categories  (38 rows) -- category labels + organization_id.
--
--   Neither carries commercial or personal data. asset_categories does
--   leak the set of organization_ids and each org's category names; if
--   that matters, scope it the same way as assets in a follow-up. It is
--   left alone here to keep this migration focused on the two tables
--   that expose fleet value and movement history.
-- ------------------------------------------------------------
