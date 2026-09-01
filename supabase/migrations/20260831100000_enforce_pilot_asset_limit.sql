-- 20260831_enforce_pilot_asset_limit.sql
--
-- Enforce the per-organization asset cap in the database.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- The cap was never enforced. check_pilot_asset_limit(org_id) exists
-- (20260211_pilot_system.sql:38) but it is a REPORTING function: it RETURNS a
-- row of (current_count, max_allowed, limit_reached) and is STABLE. Nothing
-- called it from a trigger, so no INSERT was ever refused by it.
--
-- Measured on production 2026-08-31: two organizations on subscription_tier
-- 'trial' hold 1,000 assets each, against an intended pilot cap of 400
-- (lib/billing/access-model.ts:89 PILOT_MAX_ASSETS). Asset creation also runs
-- client-side (components/assets/AddAssetModal.tsx:74) and bulk import inserts
-- straight from the browser (ImportAssetsModal.tsx:304), so neither path
-- passes through requireWriteAccess. RLS permits the insert; nothing counted.
--
-- A BEFORE INSERT trigger is therefore the only place the cap can actually
-- hold, because it is the only place every write path has in common.
--
-- ---------------------------------------------------------------------------
-- LIMIT RESOLUTION
-- ---------------------------------------------------------------------------
-- The old reporting helper hardcoded 50 for pilots, which matches neither
-- PILOT_MAX_ASSETS (400) nor any row in subscription_plans (100 / 500 / 2000 /
-- 999999). This migration wires the limit to real data instead:
--
--   active pilot  -> 400            (PILOT_MAX_ASSETS, the documented offer)
--   otherwise     -> subscription_plans.max_assets via the org's subscription
--   no plan found -> 100            (starter, the most restrictive real tier)
--
-- The helper is updated to agree with the trigger, so the number the UI shows
-- and the number the database enforces cannot drift apart.
--
-- EXEMPTS NOTHING. Load-test tenants are given headroom by setting their tier
-- explicitly (see the companion statement in
-- supabase/migrations/pending/20260831_loadtest_org_headroom.sql), never by
-- weakening this trigger.
--
-- ---------------------------------------------------------------------------
-- SAFETY
-- ---------------------------------------------------------------------------
-- Idempotent: CREATE OR REPLACE for functions, DROP TRIGGER IF EXISTS before
-- CREATE TRIGGER. Safe to run whether or not a trigger already exists.
--
-- This does NOT delete or reject existing rows. Organizations already over
-- their cap keep every asset they have; they simply cannot add more until they
-- are under it. Enforcing retroactively would break live tenants, including
-- the two load-test orgs this repo deliberately keeps.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Single source of truth for "how many assets may this org have"
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.org_max_assets(org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INTEGER;
BEGIN
  -- Pilots get the documented pilot allowance regardless of plan.
  IF public.is_pilot_active(org_id) THEN
    RETURN 400;  -- keep in step with PILOT_MAX_ASSETS in lib/billing/access-model.ts
  END IF;

  SELECT sp.max_assets
  INTO v_max
  FROM public.subscriptions s
  JOIN public.subscription_plans sp ON sp.id = s.plan_id
  WHERE s.organization_id = org_id
    AND s.status IN ('active', 'trialing')
  ORDER BY sp.max_assets DESC   -- if somehow multiple, the most generous wins
  LIMIT 1;

  -- No subscription row at all: fall back to the most restrictive real tier
  -- rather than to unlimited. Failing closed is the point of this migration.
  RETURN COALESCE(v_max, 100);
END;
$$;

COMMENT ON FUNCTION public.org_max_assets(UUID) IS
  'Asset ceiling for an organization: 400 while a pilot is active, otherwise '
  'subscription_plans.max_assets for its active subscription, else 100.';

-- ---------------------------------------------------------------------------
-- 2. Enforce it on INSERT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_asset_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_max   INTEGER;
BEGIN
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
$$;

-- Row-level BEFORE INSERT: every write path goes through this, including the
-- browser-side inserts that bypass the application write gate entirely.
--
-- Note on bulk import: this fires per row, so a 400-row import that crosses the
-- cap fails on the row that crosses it and rolls back the whole statement.
-- That is the correct outcome -- a partially applied import is worse -- but it
-- is why the client should check remaining headroom before uploading.
DROP TRIGGER IF EXISTS trg_enforce_asset_limit ON public.assets;

CREATE TRIGGER trg_enforce_asset_limit
  BEFORE INSERT ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_asset_limit();

-- ---------------------------------------------------------------------------
-- 3. Make the reporting helper agree with the trigger
-- ---------------------------------------------------------------------------
-- Same signature and return shape as 20260211_pilot_system.sql, so existing
-- callers are unaffected; only the number changes, and only to stop it
-- disagreeing with what is now enforced.

CREATE OR REPLACE FUNCTION public.check_pilot_asset_limit(org_id UUID)
RETURNS TABLE (
  current_count INTEGER,
  max_allowed   INTEGER,
  limit_reached BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_max   INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.assets
  WHERE organization_id = org_id
    AND archived_at IS NULL;

  v_max := public.org_max_assets(org_id);

  RETURN QUERY SELECT v_count, v_max, (v_count >= v_max);
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. The trigger exists and is enabled ('O' = enabled, 'D' = disabled):
--
--   SELECT tgname, tgenabled
--   FROM pg_trigger
--   WHERE tgrelid = 'public.assets'::regclass
--     AND NOT tgisinternal;
--
-- 2. Every organization's ceiling and current usage:
--
--   SELECT o.id, o.name, o.subscription_tier,
--          (public.check_pilot_asset_limit(o.id)).*
--   FROM public.organizations o
--   ORDER BY 5 DESC;
--
--    Organizations already over their cap will show limit_reached = true.
--    That is expected and is not corrected by this migration.
--
-- 3. The cap actually refuses a write (run against a disposable org, expect an
--    exception once at the limit):
--
--   INSERT INTO public.assets (organization_id, name, qr_code, status)
--   VALUES ('<org-at-cap>', 'limit probe', 'qr-limit-probe', 'available');
