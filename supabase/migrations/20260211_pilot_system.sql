-- ============================================================
-- TraviXO Pilot System Migration
-- Date: 2026-02-11
-- Purpose: Enforce 14-day pilot on new signups, add pilot
--          tracking columns, fix Professional pricing,
--          add pilot-aware asset limit check
-- ============================================================

-- 1. Add pilot tracking columns to organizations (if missing)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS pilot_notes TEXT,
  ADD COLUMN IF NOT EXISTS converted_to_paid BOOLEAN DEFAULT false;

-- 2. Fix Professional plan pricing (1200 EUR/month, 12960 EUR/year)
UPDATE public.subscription_plans
SET price_monthly = 1200.00,
    price_yearly  = 12960.00
WHERE slug = 'professional';

-- 3. Helper: check if pilot is currently active
CREATE OR REPLACE FUNCTION is_pilot_active(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT is_pilot
            AND (pilot_start_date IS NULL OR NOW() >= pilot_start_date)
            AND (pilot_end_date   IS NULL OR NOW() <= pilot_end_date)
     FROM public.organizations
     WHERE id = org_id),
    false
  );
$$;

-- 4. Helper: pilot-aware asset limit (50 for pilots, plan limit otherwise)
CREATE OR REPLACE FUNCTION check_pilot_asset_limit(org_id UUID)
RETURNS TABLE (
  current_count INTEGER,
  max_allowed   INTEGER,
  limit_reached BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_count   INTEGER;
  v_max     INTEGER;
  v_pilot   BOOLEAN;
BEGIN
  -- Current asset count
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.assets
  WHERE organization_id = org_id;

  -- Is pilot active?
  SELECT is_pilot_active(org_id) INTO v_pilot;

  IF v_pilot THEN
    v_max := 50;
  ELSE
    SELECT COALESCE(sp.max_assets, 100)
    INTO v_max
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON s.plan_id = sp.id
    WHERE s.organization_id = org_id
      AND s.status IN ('active', 'trialing')
    LIMIT 1;

    IF v_max IS NULL THEN
      v_max := 100;
    END IF;
  END IF;

  RETURN QUERY SELECT v_count, v_max, (v_count >= v_max);
END;
$$;

-- 5. Update create_organization_and_user to set pilot fields on new orgs
CREATE OR REPLACE FUNCTION create_organization_and_user(
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
    NOW() + INTERVAL '14 days',
    NOW() + INTERVAL '14 days'
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
      NOW(), NOW() + INTERVAL '14 days',
      NOW(), NOW() + INTERVAL '14 days'
    )
    ON CONFLICT (organization_id) DO NOTHING;
  END IF;

  -- Grant all features via entitlement overrides for pilot period
  INSERT INTO public.entitlement_overrides (organization_id, feature, granted, reason, expires_at)
  SELECT v_org_id, f.feature, true, 'pilot', NOW() + INTERVAL '14 days'
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
