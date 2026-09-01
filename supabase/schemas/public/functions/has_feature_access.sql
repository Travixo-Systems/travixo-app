CREATE OR REPLACE FUNCTION public.has_feature_access (
  org_id       uuid,
  feature_name text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  org_is_pilot BOOLEAN;
  org_pilot_active BOOLEAN;
  org_subscription_active BOOLEAN;
  feature_enabled BOOLEAN;
BEGIN
  -- Check if organization is a pilot
  SELECT 
    is_pilot,
    (is_pilot AND NOW() BETWEEN COALESCE(pilot_start_date, NOW()) AND COALESCE(pilot_end_date, NOW()))
  INTO org_is_pilot, org_pilot_active
  FROM organizations
  WHERE id = org_id;
  
  -- Pilots get all features during pilot period
  IF org_pilot_active THEN
    RETURN TRUE;
  END IF;
  
  -- Check if subscription is active and has the feature
  SELECT 
    (s.status = 'active' OR s.status = 'trialing'),
    (sp.features->feature_name)::boolean
  INTO org_subscription_active, feature_enabled
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.organization_id = org_id;
  
  RETURN COALESCE(org_subscription_active AND feature_enabled, FALSE);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."has_feature_access"(uuid, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."has_feature_access"(uuid, text) FROM PUBLIC;
