CREATE OR REPLACE FUNCTION public.admin_mark_paid (
  p_org_id    uuid,
  p_plan_slug text,
  p_reason    text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_actor   UUID := auth.uid();
  v_before  JSONB;
  v_after   JSONB;
  v_reason  TEXT := btrim(COALESCE(p_reason, ''));
BEGIN
  -- Defense in depth: never trust the caller.
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- A reason is the whole point. Ten characters is not a high bar, but it does
  -- stop "ok" and an empty string, which is what makes an audit trail useless.
  IF length(v_reason) < 10 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  -- Allowlist the plan against real rows rather than accepting free text, so a
  -- typo cannot create an organization on a tier that does not exist.
  IF NOT EXISTS (
    SELECT 1 FROM public.subscription_plans
    WHERE slug = p_plan_slug AND is_active
  ) THEN
    RAISE EXCEPTION 'invalid_plan: %', p_plan_slug USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
           'is_pilot',            is_pilot,
           'converted_to_paid',   converted_to_paid,
           'subscription_tier',   subscription_tier,
           'subscription_status', subscription_status,
           'stripe_customer_id',  stripe_customer_id
         )
    INTO v_before
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: %', p_org_id USING ERRCODE = 'P0002';
  END IF;

  -- Already converted: succeed without rewriting, so a double click cannot
  -- overwrite a real Stripe conversion with a manual one.
  IF (v_before ->> 'converted_to_paid')::BOOLEAN IS TRUE THEN
    RETURN jsonb_build_object(
      'changed', false,
      'reason',  'already_converted',
      'before',  v_before
    );
  END IF;

  UPDATE public.organizations
  SET converted_to_paid   = true,
      is_pilot            = false,
      subscription_tier   = p_plan_slug,
      subscription_status = 'active',
      updated_at          = now()
  WHERE id = p_org_id;

  SELECT jsonb_build_object(
           'is_pilot',            is_pilot,
           'converted_to_paid',   converted_to_paid,
           'subscription_tier',   subscription_tier,
           'subscription_status', subscription_status,
           'stripe_customer_id',  stripe_customer_id
         )
    INTO v_after
  FROM public.organizations
  WHERE id = p_org_id;

  INSERT INTO public.admin_audit_log
    (actor_id, action, target_org_id, target_user_id, before, after)
  VALUES
    (v_actor,
     'admin_mark_paid',
     p_org_id,
     NULL,
     v_before,
     v_after || jsonb_build_object(
       'reason', v_reason,
       'source', 'admin_manual',
       'plan',   p_plan_slug
     ));

  RETURN jsonb_build_object('changed', true, 'before', v_before, 'after', v_after);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."admin_mark_paid"(uuid, text, text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."admin_mark_paid"(uuid, text, text) IS 'Record an off-Stripe payment for an organization. Requires super admin and a reason of at least 10 characters. Logs to admin_audit_log with source=admin_manual so manual grants stay distinguishable from Stripe conversions. For "needs more time", use extend_trial() instead.';
