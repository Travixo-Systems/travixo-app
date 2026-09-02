CREATE OR REPLACE FUNCTION public.check_pilot_asset_limit (
  org_id uuid
)
  RETURNS TABLE (
    current_count integer,
    max_allowed   integer,
    limit_reached boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_count INTEGER;
  v_max   INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.assets
  WHERE organization_id = org_id
    AND archived_at IS NULL;

  v_max := public.org_max_assets(org_id);

  RETURN QUERY SELECT v_count, v_max, (v_count >= v_max);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."check_pilot_asset_limit"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."check_pilot_asset_limit"(uuid) FROM PUBLIC;
