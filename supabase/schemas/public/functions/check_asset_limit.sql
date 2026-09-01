CREATE OR REPLACE FUNCTION public.check_asset_limit (
  org_id uuid
)
  RETURNS TABLE (
    current_count integer,
    max_allowed   integer,
    limit_reached boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM assets WHERE organization_id = org_id),
    COALESCE(
      (SELECT sp.max_assets 
       FROM subscriptions s 
       JOIN subscription_plans sp ON s.plan_id = sp.id 
       WHERE s.organization_id = org_id 
       AND s.status IN ('active', 'trialing')
       LIMIT 1),
      100
    )::INTEGER,
    (SELECT COUNT(*) FROM assets WHERE organization_id = org_id) >= 
    COALESCE(
      (SELECT sp.max_assets 
       FROM subscriptions s 
       JOIN subscription_plans sp ON s.plan_id = sp.id 
       WHERE s.organization_id = org_id 
       AND s.status IN ('active', 'trialing')
       LIMIT 1),
      100
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."check_asset_limit"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."check_asset_limit"(uuid) FROM PUBLIC;
