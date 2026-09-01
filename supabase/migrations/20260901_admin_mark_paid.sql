-- 20260901_admin_mark_paid.sql
--
-- Let a platform admin record that an organization has paid OUTSIDE Stripe.
--
-- ---------------------------------------------------------------------------
-- WHY THIS NEEDS TO BE DELIBERATE
-- ---------------------------------------------------------------------------
-- converted_to_paid is the flag that means "this customer paid us". Until now
-- only the Stripe webhook set it (lib/billing/mark-converted.ts, called from
-- app/api/stripe/webhook/route.ts), so it could not be true unless money had
-- actually moved.
--
-- Adding an admin button changes that. Someone can now assert payment that
-- Stripe has no record of, which is legitimate for a bank transfer or an
-- invoice, and is a quiet way to inflate a revenue figure if it is used
-- casually. So this function makes the assertion expensive to make and
-- impossible to make anonymously:
--
--   * a reason is REQUIRED, and must be more than a shrug
--   * the actor, the before state and the reason all go to admin_audit_log
--   * source = 'admin_manual' is written into the audit row, so a manual grant
--     is always distinguishable from a Stripe conversion after the fact
--
-- If the intent is only "this prospect needs more time", this is the WRONG
-- function: use extend_trial(), which restores access without claiming payment.
--
-- ---------------------------------------------------------------------------
-- WHAT IT WRITES
-- ---------------------------------------------------------------------------
--   organizations.converted_to_paid  -> true
--   organizations.is_pilot           -> false
--   organizations.subscription_tier  -> p_plan_slug
--   organizations.subscription_status-> 'active'
--
-- It deliberately does NOT touch stripe_customer_id. An org marked paid this
-- way has no Stripe record, and inventing one would make reconciliation worse,
-- not better.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_mark_paid(
  p_org_id    UUID,
  p_plan_slug TEXT,
  p_reason    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.admin_mark_paid(UUID, TEXT, TEXT) IS
  'Record an off-Stripe payment for an organization. Requires super admin and '
  'a reason of at least 10 characters. Logs to admin_audit_log with '
  'source=admin_manual so manual grants stay distinguishable from Stripe '
  'conversions. For "needs more time", use extend_trial() instead.';

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. The function exists:
--
--   SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'admin_mark_paid';
--
-- 2. Every manual grant, with who and why:
--
--   SELECT created_at, actor_id, target_org_id,
--          after ->> 'reason' AS reason,
--          after ->> 'plan'   AS plan
--   FROM public.admin_audit_log
--   WHERE action = 'admin_mark_paid'
--   ORDER BY created_at DESC;
--
-- 3. Manual grants vs Stripe conversions, which is the number that matters
--    when anyone asks how many customers are paying:
--
--   SELECT o.name, o.subscription_tier,
--          (o.stripe_customer_id IS NOT NULL) AS has_stripe,
--          EXISTS (SELECT 1 FROM public.admin_audit_log l
--                   WHERE l.target_org_id = o.id
--                     AND l.action = 'admin_mark_paid') AS granted_manually
--   FROM public.organizations o
--   WHERE o.converted_to_paid;
