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
  -- H-5: the profile is bound to the CALLER. p_user_id is ignored.
  v_actor    UUID := auth.uid();
BEGIN
  -- H-5: no session, no signup. Previously a NULL id reached the INSERT and
  -- failed on a constraint with an opaque message.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'signup_requires_session: create_organization_and_user must be called with an authenticated session; the profile is bound to auth.uid().'
      USING ERRCODE = '42501';
  END IF;

  -- H-5: a caller who already has a profile cannot create a second one. This
  -- previously surfaced as a raw 23505 duplicate-key error through PostgREST,
  -- leaking the constraint name; it is now named and intentional.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN
    RAISE EXCEPTION 'signup_already_completed: this account already has a profile and cannot create another organisation.'
      USING ERRCODE = '23505';
  END IF;

  -- Create organization with pilot fields
  INSERT INTO public.organizations (
    name, slug, subscription_tier, subscription_status,
    is_pilot, pilot_start_date, pilot_end_date, trial_ends_at
  ) VALUES (
    p_org_name,
    p_org_slug,
    'travixo',
    'trialing',
    true,
    NOW(),
    NOW() + INTERVAL '30 days',
    NOW() + INTERVAL '30 days'
  )
  RETURNING id INTO v_org_id;

  -- Create user profile linked to org.
  -- H-5: id and email come from the session, never from the arguments.
  INSERT INTO public.users (id, email, full_name, organization_id, role)
  VALUES (
    v_actor,
    COALESCE((SELECT u.email FROM auth.users u WHERE u.id = v_actor), p_user_email),
    p_user_full_name,
    v_org_id,
    'owner'
  );

  -- The single plan row
  SELECT id INTO v_plan_id
  FROM public.subscription_plans
  WHERE slug = 'travixo'
  LIMIT 1;

  -- Create subscription (trialing; the pilot window grants access)
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

  RETURN v_org_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) TO "authenticated";

COMMENT ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) IS 'Signup: creates the org, owner profile and trialing subscription. H-5: the profile is bound to auth.uid(); p_user_id is accepted for signature compatibility but IGNORED. Refuses without a session, and refuses a caller that already has a profile. Pilot window is 30 days -- must match PILOT_FULL_DAYS in lib/billing/pilot-window.ts and the "30-day trial" claim on the website. No feature grants: one plan carries every feature.';

REVOKE ALL ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) FROM "postgres";
