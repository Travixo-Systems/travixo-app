-- 20260915100000_grant_rental_management.sql
--
-- Grant rental_management on the travixo plan row.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT
-- ---------------------------------------------------------------------------
-- 20260914160000 seeded the travixo row's features by copying the twelve-item
-- grant list out of create_organization_and_user(). That list predates
-- rental_management being added to FEATURE_REGISTRY (lib/subscription.ts), so
-- the flag was never written.
--
-- Consequence: has_feature_access(org, 'rental_management') returns FALSE for
-- every organization on the only active plan, because it reads
-- (sp.features->'rental_management')::boolean and the key is absent. Measured
-- on a live org after it was set to a paid state -- vgp_compliance,
-- digital_audits and api_access all returned true, rental_management alone
-- returned false.
--
-- The subscription page meanwhile lists "Sorties et retours de location" among
-- the features included at every fleet size. The page was promising something
-- the plan did not grant. Rentals are shipped and verified, so the fix is to
-- grant the flag rather than to remove the promise.
--
-- Written with jsonb_set so the other twelve flags are preserved rather than
-- rewritten, and as a boolean true because has_feature_access casts
-- ::boolean -- '"true"'::jsonb::boolean raises.

BEGIN;

UPDATE public.subscription_plans
SET features   = jsonb_set(features, '{rental_management}', 'true'::jsonb, true),
    updated_at = now()
WHERE slug = 'travixo';

COMMIT;

-- ---------------------------------------------------------------------------
-- RLS VERIFIED
-- ---------------------------------------------------------------------------
-- subscription_plans: one policy, "Anyone can view subscription plans",
--   FOR SELECT TO PUBLIC USING (is_active = true). UNCHANGED. No write policy
--   exists, so only service_role writes this row, which is what applies this
--   migration. No table, column, grant or policy is altered here.
--
-- has_feature_access() is SECURITY DEFINER and reads the row directly, so the
-- grant takes effect for every caller without a policy change.

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- Removes the key entirely rather than setting it false, restoring the exact
-- prior shape. Note that doing so re-breaks rentals for every customer.
--
-- BEGIN;
-- UPDATE public.subscription_plans
-- SET features = features - 'rental_management', updated_at = now()
-- WHERE slug = 'travixo';
-- COMMIT;
