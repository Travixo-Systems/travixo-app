-- ============================================================
-- TraviXO Backfill: Existing Organizations → Pilot Onboarding
-- Date: 2026-02-11
-- Purpose: Activate pilot + onboarding flags for orgs that were
--          created before the self-service onboarding system
--          so existing agents get the full onboarding experience
--          (banner, demo data, welcome email) on next login.
-- ============================================================

-- 1. Set pilot flags on all existing orgs that aren't already pilots
UPDATE public.organizations
SET is_pilot          = true,
    pilot_start_date  = NOW(),
    pilot_end_date    = NOW() + INTERVAL '30 days',
    trial_ends_at     = NOW() + INTERVAL '30 days',
    subscription_status = 'trialing',
    onboarding_completed = false,
    demo_data_seeded     = false
WHERE is_pilot IS NOT true
  OR is_pilot IS NULL;

-- 2. Grant entitlement overrides for the pilot period (skip if already granted)
INSERT INTO public.entitlement_overrides (organization_id, feature, granted, reason, expires_at)
SELECT o.id, f.feature, true, 'pilot-backfill', NOW() + INTERVAL '30 days'
FROM public.organizations o
CROSS JOIN (VALUES
  ('qr_generation'), ('public_scanning'), ('basic_reports'), ('csv_export'),
  ('email_support'), ('vgp_compliance'), ('digital_audits'), ('api_access'),
  ('custom_branding'), ('priority_support'), ('dedicated_support'),
  ('custom_integrations')
) AS f(feature)
WHERE o.is_pilot = true
ON CONFLICT (organization_id, feature) DO NOTHING;
