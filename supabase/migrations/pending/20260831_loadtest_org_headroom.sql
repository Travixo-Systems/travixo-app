-- 20260831_loadtest_org_headroom.sql   -- PENDING: NOT APPLIED, awaiting approval
--
-- Give the two load-test tenants a plan that fits the data they hold, so the
-- new asset-limit trigger does not block them.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS SEPARATE FROM THE TRIGGER MIGRATION
-- ---------------------------------------------------------------------------
-- 20260831_enforce_pilot_asset_limit.sql exempts nothing. Load-test tenants
-- keep working because their TIER says they may, not because the trigger looks
-- the other way for them. That distinction is the whole point: an exemption
-- list inside the trigger would be a permanent hole that outlives the reason
-- for it, and would be invisible to anyone reading subscription_plans.
--
-- ---------------------------------------------------------------------------
-- MEASURED STATE (production, 2026-08-31, read-only)
-- ---------------------------------------------------------------------------
--   ProMachinery France  e9248833-65db-43ad-b0cb-c76d58fd9abb   1,000 assets
--   TechLift Solutions   b35d5605-6cbb-4977-8d11-fa312a90bc38   1,000 assets
--
--   Both: subscription_tier 'trial', is_pilot = true, but
--         pilot_end_date = 2026-03-19 (EXPIRED, five months ago).
--
--   Because the pilot window has closed, is_pilot_active() returns false, so
--   org_max_assets() resolves their ceiling from their subscription: plan
--   'professional', max_assets = 500.
--
--   1,000 held against a 500 ceiling. Without this statement, the trigger
--   would refuse every new asset for both tenants -- they keep their existing
--   rows, but a load test that creates assets would fail.
--
--   'business' (max_assets = 2,000) leaves headroom for a 1,000-asset tenant
--   to keep growing under test. 'enterprise' (999,999) would work too but is
--   effectively unlimited, which defeats the point of having a cap at all.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT DO
-- ---------------------------------------------------------------------------
-- It does not delete anything. These two organizations are kept deliberately
-- as load-test tenants and must never be removed.
--
-- It does not touch billing: these are trialing subscriptions with no Stripe
-- customer attached, so moving the plan has no financial effect.

BEGIN;

-- Point both load-test orgs at the business plan.
UPDATE public.subscriptions s
SET plan_id = (SELECT id FROM public.subscription_plans WHERE slug = 'business'),
    updated_at = NOW()
WHERE s.organization_id IN (
        'e9248833-65db-43ad-b0cb-c76d58fd9abb',  -- ProMachinery France
        'b35d5605-6cbb-4977-8d11-fa312a90bc38'   -- TechLift Solutions
      )
  AND s.status IN ('active', 'trialing');

-- Keep organizations.subscription_tier consistent with the subscription row.
-- These two are read by different code paths and a mismatch is confusing to
-- debug later.
UPDATE public.organizations
SET subscription_tier = 'business',
    updated_at = NOW()
WHERE id IN (
  'e9248833-65db-43ad-b0cb-c76d58fd9abb',
  'b35d5605-6cbb-4977-8d11-fa312a90bc38'
);

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- Expect max_allowed = 2000 and limit_reached = false for both:
--
--   SELECT o.name,
--          (public.check_pilot_asset_limit(o.id)).*
--   FROM public.organizations o
--   WHERE o.id IN ('e9248833-65db-43ad-b0cb-c76d58fd9abb',
--                  'b35d5605-6cbb-4977-8d11-fa312a90bc38');
--
-- ---------------------------------------------------------------------------
-- WORTH DECIDING SEPARATELY
-- ---------------------------------------------------------------------------
-- Measured across all 19 production organizations: 16 carry is_pilot = true,
-- and of those 12 have a pilot_end_date already in the past (4 are still
-- inside their window). There are 7 distinct end dates, including one set to
-- 2099-12-31, which is a sentinel for "never expires" rather than a real date.
--
-- The consequence for this migration: those 12 organizations do NOT get the
-- 400-asset pilot allowance, because is_pilot_active() correctly reads their
-- window as closed. They fall through to their plan limit instead. That is
-- probably the intended behaviour, but it means is_pilot = true is not a
-- reliable signal on its own, and anyone reading the flag without checking
-- the dates will draw the wrong conclusion.
--
-- Flagged rather than fixed: which of those 12 should still be treated as
-- pilots is a commercial question, not a performance one.
