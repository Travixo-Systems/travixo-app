-- 20260915110000_stop_seeding_entitlement_overrides.sql
--
-- Stop writing entitlement_overrides at signup. Keep the table and its rows.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- entitlement_overrides only ever fed per-feature gating, and per-feature
-- gating is gone: one plan carries every feature, so a per-feature question
-- has no answer but yes.
--
-- Enumerated before changing anything:
--
--   application code   ZERO reads. lib/billing/entitlements.ts dropped its
--                      query in the feature-gating collapse; what remains is a
--                      comment and the generated row type in types/database.ts.
--   RLS policies       NONE on any other table reference it. Its own table
--                      carries one self-scoped SELECT policy ("Users can view
--                      own org entitlements"), which is a policy ON it, not a
--                      read BY anything.
--   DB functions       exactly one writer, this function. No reader.
--                      has_feature_access() never consulted it, despite the
--                      name: it reads subscription_plans.features.
--
-- CATALOG CAVEAT, same as the earlier has_feature_access enumeration: this is
-- read from supabase/schemas/, the declarative mirror, refreshed from
-- production three times on 2026-09-14. There is no exec_sql RPC and no direct
-- connection available, so pg_policies and pg_proc were NOT queried directly.
-- Strong evidence, not conclusive. Nothing is dropped here, so a missed
-- reference degrades to "an override row stops being created", never to a
-- broken read.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT DO
-- ---------------------------------------------------------------------------
-- The table stays. Its 228 existing rows across 19 organizations stay. No
-- column, index, grant or policy is touched. Dropping any of it needs psql
-- access and a separate decision.
--
-- rental_management is deliberately NOT added to the seed list. Adding it
-- would extend a mechanism that is being retired.
--
-- Pilots are governed by CAPACITY and DURATION only: org_max_assets() returns
-- the pilot allowance while the window is open, and accessLevel() degrades on
-- the window closing. Neither consults a feature.

BEGIN;

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

  -- No entitlement_overrides seeding. A pilot is not granted features one by
  -- one any more: every feature ships on the one plan, and the pilot window
  -- governs duration while org_max_assets() governs capacity.

  RETURN v_org_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) IS 'Signup: creates the org, owner profile and trialing subscription. Pilot window is 30 days -- must match PILOT_FULL_DAYS in lib/billing/pilot-window.ts and the "30-day trial" claim on the website. No feature grants: one plan carries every feature.';

REVOKE ALL ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) FROM PUBLIC;

COMMIT;

-- ---------------------------------------------------------------------------
-- RLS VERIFIED
-- ---------------------------------------------------------------------------
-- entitlement_overrides: RLS enabled, one policy ("Users can view own org
--   entitlements", FOR SELECT, organization-scoped). UNCHANGED. The table,
--   its rows, its index and its grants are all untouched -- this migration
--   only stops a function writing to it.
-- organizations, users, subscriptions: written by this function as before,
--   unchanged. All are organization-scoped with RLS enabled; the function is
--   SECURITY DEFINER and bypasses them, which is required at signup because
--   the caller has no organization yet.
--
-- No policy, table, column, index or grant is altered by this migration.

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- Restores the twelve-feature seed. Re-apply 20260914160000, which carries the
-- previous body including the entitlement_overrides INSERT.
