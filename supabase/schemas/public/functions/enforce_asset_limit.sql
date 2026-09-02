CREATE OR REPLACE FUNCTION public.enforce_asset_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_count INTEGER;
  v_max   INTEGER;
BEGIN
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
