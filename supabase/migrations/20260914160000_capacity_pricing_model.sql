-- 20260914160000_capacity_pricing_model.sql
--
-- Replace the four-tier plan model with one plan priced by licensed asset
-- capacity.
--
-- ---------------------------------------------------------------------------
-- WHY NOTHING IS DELETED
-- ---------------------------------------------------------------------------
-- subscriptions.plan_id is NOT NULL with an FK to subscription_plans, so the
-- old rows cannot be deleted while any subscription points at them. They are
-- deactivated instead (is_active = false), which removes them from the public
-- pricing list -- the only thing that policy exposes -- while keeping every FK
-- satisfiable and the historical record intact.
--
-- ORDER IS LOAD-BEARING:
--   1. insert the new row          (nothing references it yet)
--   2. repoint every subscription  (FK stays satisfied at every instant)
--   3. deactivate the old rows     (now unreferenced by anything live)
-- Deactivating before repointing would leave live subscriptions pointing at
-- an inactive plan; deleting at any point would violate the FK.
--
-- ---------------------------------------------------------------------------
-- WHERE CAPACITY LIVES
-- ---------------------------------------------------------------------------
-- max_assets/max_users on the plan row are set to the int4 ceiling as a
-- SENTINEL, not a limit. Capacity is a property of the SUBSCRIPTION now
-- (licensed_capacity, the Stripe item quantity), because two customers on the
-- same plan license different amounts. org_max_assets() still reads
-- subscription_plans.max_assets, so a small number there would cap every
-- customer at it; the sentinel makes the plan row stop being the ceiling.
-- The real ceiling is enforced against licensed_capacity.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The single plan row
-- ---------------------------------------------------------------------------
-- features must be jsonb BOOLEAN true, not the string "true":
-- has_feature_access() casts (sp.features->feature_name)::boolean, and
-- '"true"'::jsonb::boolean errors rather than returning true.
INSERT INTO public.subscription_plans (
  name, slug, description,
  price_monthly, price_yearly,
  max_assets, max_users,
  features, is_active, display_order,
  stripe_price_monthly, stripe_price_annual
)
VALUES (
  'TraviXO',
  'travixo',
  'Capacite d''equipements sous licence. Toutes les fonctionnalites incluses.',
  179,
  1790,
  2147483647,
  2147483647,
  jsonb_build_object(
    'qr_generation',       true,
    'public_scanning',     true,
    'basic_reports',       true,
    'csv_export',          true,
    'email_support',       true,
    'vgp_compliance',      true,
    'digital_audits',      true,
    'api_access',          true,
    'custom_branding',     true,
    'priority_support',    true,
    'dedicated_support',   true,
    'custom_integrations', true
  ),
  true,
  1,
  'price_1UFe7pPQl0rxNu3n10pjKaO1',
  'price_1UFe7pPQl0rxNu3npG3iymYI'
)
ON CONFLICT (slug) DO UPDATE SET
  name                 = EXCLUDED.name,
  description          = EXCLUDED.description,
  price_monthly        = EXCLUDED.price_monthly,
  price_yearly         = EXCLUDED.price_yearly,
  max_assets           = EXCLUDED.max_assets,
  max_users            = EXCLUDED.max_users,
  features             = EXCLUDED.features,
  is_active            = EXCLUDED.is_active,
  display_order        = EXCLUDED.display_order,
  stripe_price_monthly = EXCLUDED.stripe_price_monthly,
  stripe_price_annual  = EXCLUDED.stripe_price_annual,
  updated_at           = now();

COMMENT ON COLUMN public.subscription_plans.max_assets IS
  'SENTINEL on the travixo row (int4 max), not a limit. Licensed capacity is '
  'per-subscription (subscriptions.licensed_capacity), because two customers '
  'on the same plan license different amounts. Retired tier rows keep their '
  'original values.';

-- ---------------------------------------------------------------------------
-- 2. Repoint every subscription at the new row
-- ---------------------------------------------------------------------------
-- VGP access is decided by plan slug in two allowlists that now include
-- 'travixo', and every feature flag on the new row is true, so no org loses
-- access by moving. Runs before deactivation so the FK is never dangling.
UPDATE public.subscriptions s
SET plan_id    = p.id,
    updated_at = now()
FROM public.subscription_plans p
WHERE p.slug = 'travixo'
  AND s.plan_id IS DISTINCT FROM p.id;

-- ---------------------------------------------------------------------------
-- 3. Retire the old rows. DELETE nothing.
-- ---------------------------------------------------------------------------
UPDATE public.subscription_plans
SET is_active  = false,
    updated_at = now()
WHERE slug IN ('starter', 'professional', 'business', 'enterprise');

-- ---------------------------------------------------------------------------
-- 4. licensed_capacity
-- ---------------------------------------------------------------------------
-- What Stripe says the customer bought: the subscription item quantity. NULL
-- means "no Stripe subscription", which is the honest value for a pilot or
-- trial that has never paid.
--
-- NOT BACKFILLED FROM ASSET COUNTS ON PURPOSE. Every existing row is a pilot
-- or trial with stripe_subscription_id IS NULL. Writing a capacity there would
-- assert a purchase that never happened, and the capacity-drift report would
-- then compare real fleets against invented licences. The webhook populates
-- this on the first real subscription event.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS licensed_capacity integer;

COMMENT ON COLUMN public.subscriptions.licensed_capacity IS
  'Licensed asset capacity = the Stripe subscription item quantity. NULL when '
  'there is no Stripe subscription (pilot/trial). Never derived from the live '
  'asset count: capacity is what was purchased, not what is in use.';

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_licensed_capacity_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_licensed_capacity_check
  CHECK (licensed_capacity IS NULL OR licensed_capacity > 0);

-- ---------------------------------------------------------------------------
-- 5. Signup provisioning must not point at retired plans
-- ---------------------------------------------------------------------------
-- Both functions hardcoded a retired slug. Left alone, a new signup would get
-- a subscription on an is_active=false plan; org_max_assets() would still read
-- its max_assets, so create_trial_subscription's 'professional' lookup would
-- have kept working by accident while create_organization_and_user's 'starter'
-- lookup returned a row whose max_assets is small. Both now resolve 'travixo'.
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
    (SELECT id FROM subscription_plans WHERE slug = 'travixo' LIMIT 1),
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
    'travixo',
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

COMMIT;

-- ---------------------------------------------------------------------------
-- RLS VERIFIED (read from supabase/schemas/, the authoritative mirror)
-- ---------------------------------------------------------------------------
-- subscription_plans: one policy, "Anyone can view subscription plans",
--   FOR SELECT TO PUBLIC USING (is_active = true). This is exactly why the old
--   rows are deactivated rather than deleted: is_active=false removes them from
--   the public pricing list without touching any FK. No write policy exists, so
--   only service_role writes these rows. UNCHANGED by this migration.
--
-- subscriptions: three policies, all scoped to the caller's organization via
--   organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
--   -- "Users can view/insert/update own organization subscription". The new
--   licensed_capacity column inherits them: RLS is row-level, so an added
--   column is covered by the existing predicates with no new policy needed.
--   There is no DELETE policy, which stays true. UNCHANGED.
--
-- assets: read by this migration only through a count in application code, not
--   here. Its eight policies are all organization-scoped. UNTOUCHED.
--
-- entitlement_overrides: written by create_organization_and_user under
--   SECURITY DEFINER, which bypasses RLS. Its single SELECT policy
--   ("Users can view own org entitlements") is UNCHANGED.
--
-- Both replaced functions keep SECURITY DEFINER with
-- SET search_path = public, pg_temp, and their original GRANT/REVOKE pairs are
-- restated verbatim so neither ends up more widely executable than before.

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- Reactivating the old rows does not restore the old model: the application no
-- longer resolves their price ids, and lib/stripe.ts has no entry for them.
--
-- BEGIN;
-- UPDATE public.subscription_plans SET is_active = true
--   WHERE slug IN ('starter', 'professional', 'business', 'enterprise');
-- ALTER TABLE public.subscriptions
--   DROP CONSTRAINT IF EXISTS subscriptions_licensed_capacity_check;
-- ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS licensed_capacity;
-- -- subscriptions.plan_id is NOT repointed back: which tier each org was on is
-- -- not recoverable from this migration. Restore from a backup if needed.
-- COMMIT;
