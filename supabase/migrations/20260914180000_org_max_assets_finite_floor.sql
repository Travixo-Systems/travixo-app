-- 20260914180000_org_max_assets_finite_floor.sql
--
-- Stop org_max_assets() returning an unbounded ceiling to organizations that
-- never bought one.
--
-- ---------------------------------------------------------------------------
-- WHAT WENT WRONG
-- ---------------------------------------------------------------------------
-- 20260914160000 set subscription_plans.max_assets on the travixo row to the
-- int4 ceiling, as a SENTINEL: under capacity pricing the real limit is
-- per-subscription (subscriptions.licensed_capacity), so the plan row must
-- stop being the limit.
--
-- But org_max_assets() still read the plan. Every org pointing at travixo --
-- which after that migration is every org -- therefore resolved to 2147483647
-- whether or not it had a subscription. Measured on live data: three
-- organizations had NO asset ceiling at all, where before they were capped at
-- 500. A real insert into one of them was accepted by the trigger with 489
-- billable assets and licensed_capacity NULL.
--
-- The sentinel is not the defect; reading it unconditionally is. So the
-- condition is fixed here rather than the value special-cased.
--
-- ---------------------------------------------------------------------------
-- THE RULE
-- ---------------------------------------------------------------------------
--   active pilot                  -> the pilot allowance (unchanged)
--   licensed_capacity IS NOT NULL -> that capacity: what was actually bought
--   anything else                 -> 100, a finite floor
--
-- 100 matches the old COALESCE default and the base tier. It is deliberately
-- NOT sized to fit the current seed organizations: two of them are over it and
-- should be. Sizing a ceiling to whatever happens to be in the database is how
-- the ceiling stops meaning anything.
--
-- Note this returns licensed_capacity itself rather than the sentinel when a
-- subscription exists, so the plan row's max_assets is no longer consulted for
-- a paying customer at all. That is the point: capacity lives on the
-- subscription now.

BEGIN;

CREATE OR REPLACE FUNCTION public.org_max_assets (
  org_id uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_licensed INTEGER;
BEGIN
  -- Pilots get the documented pilot allowance regardless of plan.
  IF public.is_pilot_active(org_id) THEN
    RETURN 400;  -- keep in step with PILOT_MAX_ASSETS in lib/billing/access-model.ts
  END IF;

  -- What the organization actually licensed. NULL means no Stripe
  -- subscription, which is not evidence of any entitlement.
  SELECT s.licensed_capacity
  INTO v_licensed
  FROM public.subscriptions s
  WHERE s.organization_id = org_id
    AND s.status IN ('active', 'trialing', 'past_due')
    AND s.licensed_capacity IS NOT NULL
  ORDER BY s.licensed_capacity DESC   -- if somehow multiple, the most generous wins
  LIMIT 1;

  IF v_licensed IS NOT NULL THEN
    RETURN v_licensed;
  END IF;

  -- No pilot, no licence. Fail closed on a finite floor rather than inheriting
  -- the plan row's sentinel, which is what left three orgs uncapped.
  RETURN 100;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."org_max_assets"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."org_max_assets"(uuid) IS
  'Asset ceiling for an organization: 400 while a pilot is active, else '
  'subscriptions.licensed_capacity when set, else a finite floor of 100. '
  'Deliberately does NOT read subscription_plans.max_assets: that column is a '
  'sentinel on the travixo row, and reading it left every org uncapped.';

COMMIT;

-- ---------------------------------------------------------------------------
-- RLS VERIFIED
-- ---------------------------------------------------------------------------
-- subscriptions: read here for licensed_capacity. Three organization-scoped
--   policies, RLS enabled, UNCHANGED by this migration. SECURITY DEFINER
--   bypasses them so the ceiling is computed identically for every caller --
--   required, since a limit that varied with the caller's RLS view would be
--   bypassable.
--
-- No policy, grant, table or column is altered here. This migration replaces
-- one function body and its COMMENT.

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- Restores the plan-reading version. Note that doing so re-opens the unbounded
-- ceiling for every org pointing at the travixo row.
--
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.org_max_assets (org_id uuid)
--   RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
--   AS $fn$
-- DECLARE v_max INTEGER;
-- BEGIN
--   IF public.is_pilot_active(org_id) THEN RETURN 400; END IF;
--   SELECT sp.max_assets INTO v_max
--   FROM public.subscriptions s
--   JOIN public.subscription_plans sp ON sp.id = s.plan_id
--   WHERE s.organization_id = org_id AND s.status IN ('active','trialing')
--   ORDER BY sp.max_assets DESC LIMIT 1;
--   RETURN COALESCE(v_max, 100);
-- END;
-- $fn$;
-- COMMIT;
