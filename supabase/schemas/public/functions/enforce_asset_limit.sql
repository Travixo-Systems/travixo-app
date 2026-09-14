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
    RAISE EXCEPTION
      'Asset limit reached for this organization (% of % used). Archive an asset or upgrade the plan.',
      v_count, v_max
      USING ERRCODE = 'check_violation',
            HINT = 'See subscription_plans.max_assets, or pilot status.';
  END IF;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_asset_limit"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."enforce_asset_limit"() IS 'BEFORE INSERT on assets. Enforces subscriptions.licensed_capacity when set (billable assets only: archived and demo excluded), else org_max_assets(). This is the only enforcement point that covers the client-side RLS writers in AddAssetModal and ImportAssetsModal, which never reach requireWriteAccess.';
