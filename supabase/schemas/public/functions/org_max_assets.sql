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
  v_licensed INTEGER;
BEGIN
  -- Pilots get the documented pilot allowance regardless of plan.
  IF public.is_pilot_active(org_id) THEN
    RETURN 400;  -- keep in step with PILOT_MAX_ASSETS in lib/billing/access-model.ts
  END IF;

  -- What the organization actually licensed. NULL means no Stripe
  -- subscription, which is not evidence of any entitlement.
  SELECT s.licensed_capacity
  INTO v_licensed
  FROM public.subscriptions s
  WHERE s.organization_id = org_id
    AND s.status IN ('active', 'trialing', 'past_due')
    AND s.licensed_capacity IS NOT NULL
  ORDER BY s.licensed_capacity DESC   -- if somehow multiple, the most generous wins
  LIMIT 1;

  IF v_licensed IS NOT NULL THEN
    RETURN v_licensed;
  END IF;

  -- No pilot, no licence. Fail closed on a finite floor rather than inheriting
  -- the plan row's sentinel, which is what left three orgs uncapped.
  RETURN 100;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."org_max_assets"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."org_max_assets"(uuid) IS 'Asset ceiling for an organization: 400 while a pilot is active, else subscriptions.licensed_capacity when set, else a finite floor of 100. Deliberately does NOT read subscription_plans.max_assets: that column is a sentinel on the travixo row, and reading it left every org uncapped.';
