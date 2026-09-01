-- ============================================================
-- 20260827_trial_30_days.sql
--
-- Aligns the pilot length with what travixosystems.com advertises.
--
-- Why
-- ---
-- The marketing site states "30-day trial" in eight places (hero badges,
-- pricing, FAQ, closing CTA) and never mentions 15. The database granted 15:
-- every real org measured (Amraoui, Ariane, jay, GUY DOMINIQUE, Demo Rental
-- Nord) had a 15-day window, and a probe signup run against production on
-- 2026-08-27 came back with pilot_end_date exactly 15 days out. The app's own
-- signup screen also said 15, so a buyer clicking "30-day trial" met a
-- contradiction on the very next page.
--
-- The shape after this migration:
--
--   day 0 ....... 30    full access        (pilot_end_date)
--   day 30 ...... 45    read-only VGP      (grace)
--   day 45+             account locked
--
-- The 45-day lockout is enforced in application code, not here:
-- lib/billing/pilot-window.ts exports PILOT_FULL_DAYS = 30 and
-- PILOT_GRACE_DAYS = 15. Keep the INTERVAL below in step with
-- PILOT_FULL_DAYS -- that pairing is the thing that drifted last time.
--
-- Safety
-- ------
-- Section 2 only ever EXTENDS an existing pilot. It filters on
-- pilot_end_date < pilot_start_date + 30 days, so an org that was manually
-- given a longer window by an admin is left untouched and nobody loses time.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New signups get 30 days.
--
--    Recreated verbatim from 20260211_pilot_system.sql except for the five
--    INTERVAL values, so the signup path is otherwise unchanged. Note this
--    function is also hardened by 20260827_advisor_hardening.sql, which
--    revokes anon EXECUTE and pins search_path; CREATE OR REPLACE preserves
--    neither, so both are re-asserted at the end of this file.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization_and_user(
  p_org_name      TEXT,
  p_org_slug      TEXT,
  p_user_id       UUID,
  p_user_email    TEXT,
  p_user_full_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- ------------------------------------------------------------
-- 2. Extend existing pilots that were issued the short window.
--
--    Anyone who signed up under the 15-day default was promised 30 by the
--    website, so they get the difference. Strictly widening: the WHERE clause
--    excludes any org whose window is already 30 days or longer.
-- ------------------------------------------------------------
UPDATE public.organizations
SET
  pilot_end_date = pilot_start_date + INTERVAL '30 days',
  trial_ends_at  = pilot_start_date + INTERVAL '30 days'
WHERE is_pilot IS TRUE
  AND pilot_start_date IS NOT NULL
  AND pilot_end_date IS NOT NULL
  AND pilot_end_date < pilot_start_date + INTERVAL '30 days';

-- Keep the subscription trial window in step with the org's pilot window.
UPDATE public.subscriptions s
SET
  trial_end            = o.pilot_end_date,
  current_period_end   = o.pilot_end_date
FROM public.organizations o
WHERE s.organization_id = o.id
  AND o.is_pilot IS TRUE
  AND o.pilot_end_date IS NOT NULL
  AND s.trial_end IS NOT NULL
  AND s.trial_end < o.pilot_end_date;

-- Feature grants expire with the pilot; move them out too, or a user would
-- keep the longer window but lose the features partway through it.
UPDATE public.entitlement_overrides e
SET expires_at = o.pilot_end_date
FROM public.organizations o
WHERE e.organization_id = o.id
  AND o.is_pilot IS TRUE
  AND e.reason IN ('pilot', 'pilot-backfill')
  AND o.pilot_end_date IS NOT NULL
  AND e.expires_at IS NOT NULL
  AND e.expires_at < o.pilot_end_date;

-- ------------------------------------------------------------
-- 3. Re-assert the hardening from 20260827_advisor_hardening.sql.
--
--    CREATE OR REPLACE FUNCTION above resets the function's ACL and config,
--    so without this the anon revoke and the pinned search_path would be
--    silently undone by this migration.
-- ------------------------------------------------------------
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_organization_and_user'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp;', fn.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, public;', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', fn.sig);
  END LOOP;
END
$$;

COMMENT ON FUNCTION public.create_organization_and_user(TEXT, TEXT, UUID, TEXT, TEXT) IS
  'Signup: creates the org, owner profile, trialing subscription and pilot '
  'feature grants. Pilot window is 30 days -- must match PILOT_FULL_DAYS in '
  'lib/billing/pilot-window.ts and the "30-day trial" claim on the website.';
