CREATE OR REPLACE FUNCTION public.org_max_assets (
  org_id uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_max INTEGER;
BEGIN
  -- Pilots get the documented pilot allowance regardless of plan.
  IF public.is_pilot_active(org_id) THEN
    RETURN 400;  -- keep in step with PILOT_MAX_ASSETS in lib/billing/access-model.ts
  END IF;

  SELECT sp.max_assets
  INTO v_max
  FROM public.subscriptions s
  JOIN public.subscription_plans sp ON sp.id = s.plan_id
  WHERE s.organization_id = org_id
    AND s.status IN ('active', 'trialing')
  ORDER BY sp.max_assets DESC   -- if somehow multiple, the most generous wins
  LIMIT 1;

  -- No subscription row at all: fall back to the most restrictive real tier
  -- rather than to unlimited. Failing closed is the point of this migration.
  RETURN COALESCE(v_max, 100);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."org_max_assets"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."org_max_assets"(uuid) IS 'Asset ceiling for an organization: 400 while a pilot is active, otherwise subscription_plans.max_assets for its active subscription, else 100.';
