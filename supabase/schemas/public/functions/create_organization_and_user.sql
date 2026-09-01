CREATE OR REPLACE FUNCTION public.create_organization_and_user (
  p_org_name       text,
  p_org_slug       text,
  p_user_id        uuid,
  p_user_email     text,
  p_user_full_name text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_org_id   UUID;
  v_plan_id  UUID;
BEGIN
  -- Create organization with pilot fields
  INSERT INTO public.organizations (
    name, slug, subscription_tier, subscription_status,
    is_pilot, pilot_start_date, pilot_end_date, trial_ends_at
  ) VALUES (
    p_org_name,
    p_org_slug,
    'starter',
    'trialing',
    true,
    NOW(),
    NOW() + INTERVAL '30 days',
    NOW() + INTERVAL '30 days'
  )
  RETURNING id INTO v_org_id;

  -- Create user profile linked to org
  INSERT INTO public.users (id, email, full_name, organization_id, role)
  VALUES (p_user_id, p_user_email, p_user_full_name, v_org_id, 'owner');

  -- Get starter plan ID
  SELECT id INTO v_plan_id
  FROM public.subscription_plans
  WHERE slug = 'starter'
  LIMIT 1;

  -- Create subscription (trialing on starter, pilot gives VGP access)
  IF v_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      organization_id, plan_id, status,
      current_period_start, current_period_end,
      trial_start, trial_end
    ) VALUES (
      v_org_id, v_plan_id, 'trialing',
      NOW(), NOW() + INTERVAL '30 days',
      NOW(), NOW() + INTERVAL '30 days'
    )
    ON CONFLICT (organization_id) DO NOTHING;
  END IF;

  -- Grant all features via entitlement overrides for pilot period
  INSERT INTO public.entitlement_overrides (organization_id, feature, granted, reason, expires_at)
  SELECT v_org_id, f.feature, true, 'pilot', NOW() + INTERVAL '30 days'
  FROM (VALUES
    ('qr_generation'), ('public_scanning'), ('basic_reports'), ('csv_export'),
    ('email_support'), ('vgp_compliance'), ('digital_audits'), ('api_access'),
    ('custom_branding'), ('priority_support'), ('dedicated_support'),
    ('custom_integrations')
  ) AS f(feature)
  ON CONFLICT (organization_id, feature) DO NOTHING;

  RETURN v_org_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) IS 'Signup: creates the org, owner profile, trialing subscription and pilot feature grants. Pilot window is 30 days -- must match PILOT_FULL_DAYS in lib/billing/pilot-window.ts and the "30-day trial" claim on the website.';

REVOKE ALL ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) FROM PUBLIC;
