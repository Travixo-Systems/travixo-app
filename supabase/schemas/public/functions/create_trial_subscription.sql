CREATE OR REPLACE FUNCTION public.create_trial_subscription()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  INSERT INTO subscriptions (
    organization_id,
    plan_id,
    status,
    billing_cycle,
    current_period_start,
    current_period_end,
    trial_start,
    trial_end
  )
  VALUES (
    NEW.id,
    (SELECT id FROM subscription_plans WHERE slug = 'professional' LIMIT 1),
    'trialing',
    'monthly',
    NOW(),
    NOW() + INTERVAL '30 days',
    NOW(),
    NOW() + INTERVAL '30 days'
  );
  
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_trial_subscription"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."create_trial_subscription"() FROM PUBLIC;
