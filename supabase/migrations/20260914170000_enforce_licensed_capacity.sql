-- 20260914170000_enforce_licensed_capacity.sql
--
-- Enforce licensed capacity at asset-insert time.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A TRIGGER AND NOT A ROUTE GUARD
-- ---------------------------------------------------------------------------
-- AddAssetModal.tsx and ImportAssetsModal.tsx write to public.assets directly
-- from the browser through RLS. They never pass through an API route, so
-- requireWriteAccess() -- which exists only in route handlers -- cannot see
-- them. Routing those two components through an API route is deliberately NOT
-- part of this change, so the only enforcement point that covers every writer
-- is the BEFORE INSERT trigger that is already attached to the table.
--
-- This is a KNOWN DIVERGENCE from write-gate coverage: those paths are gated
-- by the database, not by requireWriteAccess. scripts/verify-write-gate-
-- coverage.mjs scans route handlers and therefore cannot observe it.
--
-- ---------------------------------------------------------------------------
-- WHICH CEILING APPLIES
-- ---------------------------------------------------------------------------
-- licensed_capacity is what the customer BOUGHT (the Stripe item quantity). It
-- is authoritative whenever it is set, because it is the thing that was paid
-- for. When it is NULL there is no Stripe subscription -- a pilot or trial --
-- and the previous behaviour stands: org_max_assets(), which returns the pilot
-- allowance while a pilot runs and the plan's max_assets afterwards.
--
-- Capacity counts the same assets the licence is sold against: archived
-- excluded (retiring a machine frees room for its replacement) and demo data
-- excluded (is_demo_data IS NOT TRUE, which is NULL-safe -- the column is
-- nullable, and = false would miss legacy rows and under-count).
--
-- The trigger never re-prices anything. Over capacity is refused, and the
-- customer raises it through POST /api/stripe/subscription/capacity.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_asset_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_count    INTEGER;
  v_max      INTEGER;
  v_licensed INTEGER;
BEGIN
  -- What the organization licensed, if it has a Stripe subscription at all.
  SELECT s.licensed_capacity
  INTO v_licensed
  FROM public.subscriptions s
  WHERE s.organization_id = NEW.organization_id
    AND s.status IN ('active', 'trialing', 'past_due')
  ORDER BY s.licensed_capacity DESC NULLS LAST
  LIMIT 1;

  IF v_licensed IS NOT NULL THEN
    -- Billable assets only: what the licence is actually sold against.
    -- is_demo_data IS NOT TRUE rather than = false, because the column is
    -- nullable and legacy rows hold NULL.
    SELECT COUNT(*)
    INTO v_count
    FROM public.assets
    WHERE organization_id = NEW.organization_id
      AND archived_at IS NULL
      AND is_demo_data IS NOT TRUE;

    IF v_count >= v_licensed THEN
      RAISE EXCEPTION
        'Licensed capacity reached (% of % assets). Increase capacity to add more.',
        v_count, v_licensed
        USING ERRCODE = 'check_violation',
              HINT = 'POST /api/stripe/subscription/capacity to license more.';
    END IF;

    RETURN NEW;
  END IF;

  -- No licensed capacity: pilot or trial. Previous behaviour, unchanged.
  v_max := public.org_max_assets(NEW.organization_id);

  -- Archived assets are excluded, matching how the dashboard counts them
  -- (app/(dashboard)/dashboard/page.tsx). Retiring a machine should free room
  -- for its replacement.
  SELECT COUNT(*)
  INTO v_count
  FROM public.assets
  WHERE organization_id = NEW.organization_id
    AND archived_at IS NULL;

  IF v_count >= v_max THEN
    RAISE EXCEPTION
      'Asset limit reached for this organization (% of % used). Archive an asset or upgrade the plan.',
      v_count, v_max
      USING ERRCODE = 'check_violation',
            HINT = 'See subscription_plans.max_assets, or pilot status.';
  END IF;

  RETURN NEW;
END;
$function$;

-- Restated verbatim from the existing definition so the replacement does not
-- silently narrow or widen who may execute it.
GRANT EXECUTE ON FUNCTION "public"."enforce_asset_limit"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."enforce_asset_limit"() IS
  'BEFORE INSERT on assets. Enforces subscriptions.licensed_capacity when set '
  '(billable assets only: archived and demo excluded), else org_max_assets(). '
  'This is the only enforcement point that covers the client-side RLS writers '
  'in AddAssetModal and ImportAssetsModal, which never reach requireWriteAccess.';

COMMIT;

-- ---------------------------------------------------------------------------
-- RLS VERIFIED
-- ---------------------------------------------------------------------------
-- assets: eight policies, every one scoped to the caller's organization via
--   organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()),
--   plus super_admin_read_all_assets for SELECT. UNCHANGED -- this migration
--   replaces a trigger function, not a policy. The trigger runs SECURITY
--   DEFINER and so counts rows regardless of the caller's RLS view, which is
--   required: a capacity check that only counted rows the caller can see would
--   be trivially bypassable.
--
-- subscriptions: read here for licensed_capacity. Its three policies are
--   organization-scoped and UNCHANGED; SECURITY DEFINER bypasses them, which is
--   why the count is correct for every caller.
--
-- The trigger attachment (trg_enforce_asset_limit BEFORE INSERT ON assets) is
-- untouched: CREATE OR REPLACE FUNCTION keeps the existing binding.

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- Restores the pre-capacity behaviour: org_max_assets() for everyone.
--
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.enforce_asset_limit()
--   RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--   AS $fn$
-- DECLARE v_count INTEGER; v_max INTEGER;
-- BEGIN
--   v_max := public.org_max_assets(NEW.organization_id);
--   SELECT COUNT(*) INTO v_count FROM public.assets
--     WHERE organization_id = NEW.organization_id AND archived_at IS NULL;
--   IF v_count >= v_max THEN
--     RAISE EXCEPTION 'Asset limit reached for this organization (% of % used). Archive an asset or upgrade the plan.',
--       v_count, v_max USING ERRCODE = 'check_violation';
--   END IF;
--   RETURN NEW;
-- END;
-- $fn$;
-- COMMIT;
