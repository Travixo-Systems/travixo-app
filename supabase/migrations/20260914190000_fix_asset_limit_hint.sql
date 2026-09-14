-- 20260914190000_fix_asset_limit_hint.sql
--
-- Point the asset-limit refusal at the right place.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- enforce_asset_limit's else-branch -- the path taken when an organization has
-- no licensed_capacity -- still ends with:
--
--   HINT = 'See subscription_plans.max_assets, or pilot status.'
--
-- That was accurate until 20260914180000, which stopped org_max_assets()
-- reading subscription_plans.max_assets at all. The ceiling it now returns is
-- either the pilot allowance or a flat floor of 100, and max_assets on the
-- travixo row is a sentinel that nothing consults. So the message sends whoever
-- hits it to a column that cannot explain the number they were just refused.
--
-- The refusal itself was correct and stays exactly as it was. Only the wording
-- changes: this migration alters no logic, no branch, and no threshold.
--
-- The new message names licensed capacity and the route that raises it, which
-- is the only action that actually lifts this limit for a non-pilot.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_asset_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_count    INTEGER;
  v_max      INTEGER;
  v_licensed INTEGER;
BEGIN
  -- What the organization licensed, if it has a Stripe subscription at all.
  SELECT s.licensed_capacity
  INTO v_licensed
  FROM public.subscriptions s
  WHERE s.organization_id = NEW.organization_id
    AND s.status IN ('active', 'trialing', 'past_due')
  ORDER BY s.licensed_capacity DESC NULLS LAST
  LIMIT 1;

  IF v_licensed IS NOT NULL THEN
    -- Billable assets only: what the licence is actually sold against.
    -- is_demo_data IS NOT TRUE rather than = false, because the column is
    -- nullable and legacy rows hold NULL.
    SELECT COUNT(*)
    INTO v_count
    FROM public.assets
    WHERE organization_id = NEW.organization_id
      AND archived_at IS NULL
      AND is_demo_data IS NOT TRUE;

    IF v_count >= v_licensed THEN
      RAISE EXCEPTION
        'Licensed capacity reached (% of % assets). Increase capacity to add more.',
        v_count, v_licensed
        USING ERRCODE = 'check_violation',
              HINT = 'POST /api/stripe/subscription/capacity to license more.';
    END IF;

    RETURN NEW;
  END IF;

  -- No licensed capacity: pilot or trial. Previous behaviour, unchanged.
  v_max := public.org_max_assets(NEW.organization_id);

  -- Archived assets are excluded, matching how the dashboard counts them
  -- (app/(dashboard)/dashboard/page.tsx). Retiring a machine should free room
  -- for its replacement.
  SELECT COUNT(*)
  INTO v_count
  FROM public.assets
  WHERE organization_id = NEW.organization_id
    AND archived_at IS NULL;

  IF v_count >= v_max THEN
    -- The hint no longer mentions subscription_plans.max_assets: since
    -- 20260914180000, org_max_assets() does not read it. This ceiling is the
    -- pilot allowance while a pilot runs, and a flat floor otherwise, so
    -- licensing capacity is the only thing that raises it for a non-pilot.
    RAISE EXCEPTION
      'Asset limit reached for this organization (% of % used). Archive an asset, or license capacity to add more.',
      v_count, v_max
      USING ERRCODE = 'check_violation',
            HINT = 'No licensed capacity on this organization. Subscribe, or POST /api/stripe/subscription/capacity to license more. An active pilot is capped at the pilot allowance.';
  END IF;

  RETURN NEW;
END;
$function$;

-- Restated verbatim so the replacement neither widens nor narrows execute
-- rights.
GRANT EXECUTE ON FUNCTION "public"."enforce_asset_limit"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."enforce_asset_limit"() IS
  'BEFORE INSERT on assets. Enforces subscriptions.licensed_capacity when set '
  '(billable assets only: archived and demo excluded), else org_max_assets(). '
  'This is the only enforcement point that covers the client-side RLS writers '
  'in AddAssetModal and ImportAssetsModal, which never reach requireWriteAccess.';

COMMIT;

-- ---------------------------------------------------------------------------
-- RLS VERIFIED
-- ---------------------------------------------------------------------------
-- No policy, grant, table or column is altered. This migration replaces one
-- function body; the two RAISE messages differ and nothing else does.
--
-- assets: eight organization-scoped policies plus super_admin_read_all_assets,
--   RLS enabled, UNCHANGED. The trigger stays SECURITY DEFINER so the count
--   spans every row in the organization rather than the caller's RLS view -- a
--   ceiling that varied by caller would be bypassable.
-- subscriptions: three organization-scoped policies, RLS enabled, UNCHANGED.
--
-- The trigger binding (trg_enforce_asset_limit BEFORE INSERT ON assets) is
-- preserved by CREATE OR REPLACE.

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- Restores the previous wording. Logic is identical either way, so reverting
-- changes only what a refused caller is told.
--
-- Re-apply 20260914170000, which carries the original message.
