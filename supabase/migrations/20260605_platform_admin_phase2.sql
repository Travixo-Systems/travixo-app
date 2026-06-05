-- ============================================================
-- TraviXO Platform Admin - Phase 2 Migration
-- Date: 2026-06-05
-- Purpose:
--   Two constrained, audited platform-admin write actions:
--     1. extend_trial(org, days)      - extend trial OR pilot window
--     2. set_feature_flag(org, flag)  - flip one allow-listed jsonb flag
--
--   Both are implemented as SECURITY DEFINER functions so that the
--   mutation AND the admin_audit_log INSERT happen in ONE transaction.
--   admin_audit_log has no client INSERT policy by design; only a
--   DEFINER function owned by a privileged role can write it. If the
--   audit INSERT fails, the whole function rolls back -> no silent or
--   half writes.
--
--   Identity model (from Phase 1, B1): the admin is org-less. The
--   acted-on org is ALWAYS the explicit p_org_id argument; it is never
--   inferred from the actor (the actor has no org). Every audit row
--   captures target_org_id = p_org_id.
--
--   Defense in depth: each function re-checks is_super_admin() and
--   re-validates its input against a hardcoded allowlist. The caller
--   (server action) is never trusted.
--
--   NO Stripe. NO plan/tier/status changes (Phase 3, blocked).
--
-- Notes:
--   - Run as the same privileged role that owns is_super_admin() /
--     get_my_organization_id() (i.e. postgres) so the DEFINER context
--     can write admin_audit_log past its no-client-write RLS.
--   - Idempotent: CREATE OR REPLACE + ADD COLUMN IF NOT EXISTS.
-- ============================================================

-- ------------------------------------------------------------
-- 1. organizations.feature_flags
--    A jsonb bag of { "<flag>": true|false }. Default '{}'.
--    Covered by the EXISTING organizations RLS (same-org read) and the
--    rekeyed super_admin_all_access (admin all-access) - no new policy
--    needed. The only writer is set_feature_flag() below, which writes
--    individual allow-listed keys.
-- ------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ------------------------------------------------------------
-- 2. extend_trial(p_org_id, p_days)
--    Extends the trial (trial_ends_at) or, for pilot orgs, the pilot
--    window (pilot_end_date). p_days is allow-listed to {7,14,30}.
--    New value = greatest(now(), current value) + p_days days, so it
--    can only move forward, never shorten an existing future date.
--    Writes an audit row capturing before/after of the affected
--    columns.
--
--    RETURNS jsonb summary { branch, before, after } for the caller.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.extend_trial(
  p_org_id UUID,
  p_days   INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor        UUID := auth.uid();
  v_is_pilot     BOOLEAN;
  v_old_trial    TIMESTAMPTZ;
  v_old_pilot    TIMESTAMPTZ;
  v_new_trial    TIMESTAMPTZ;
  v_new_pilot    TIMESTAMPTZ;
  v_branch       TEXT;
  v_before       JSONB;
  v_after        JSONB;
BEGIN
  -- Defense in depth: never trust the caller.
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Allowlist: reject any free-form day count.
  IF p_days NOT IN (7, 14, 30) THEN
    RAISE EXCEPTION 'invalid_days: %', p_days USING ERRCODE = '22023';
  END IF;

  -- Lock the org row and read current state.
  SELECT is_pilot, trial_ends_at, pilot_end_date
    INTO v_is_pilot, v_old_trial, v_old_pilot
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: %', p_org_id USING ERRCODE = 'P0002';
  END IF;

  IF v_is_pilot THEN
    v_branch := 'pilot';
    -- Never shorten: anchor at the later of now() and the current value.
    v_new_pilot := GREATEST(now(), COALESCE(v_old_pilot, now()))
                   + make_interval(days => p_days);
    v_new_trial := v_old_trial;  -- untouched

    UPDATE public.organizations
       SET pilot_end_date = v_new_pilot,
           updated_at     = now()
     WHERE id = p_org_id;
  ELSE
    v_branch := 'trial';
    v_new_trial := GREATEST(now(), COALESCE(v_old_trial, now()))
                   + make_interval(days => p_days);
    v_new_pilot := v_old_pilot;  -- untouched

    UPDATE public.organizations
       SET trial_ends_at = v_new_trial,
           updated_at    = now()
     WHERE id = p_org_id;
  END IF;

  v_before := jsonb_build_object(
    'is_pilot',       v_is_pilot,
    'trial_ends_at',  v_old_trial,
    'pilot_end_date', v_old_pilot
  );
  v_after := jsonb_build_object(
    'is_pilot',       v_is_pilot,
    'trial_ends_at',  v_new_trial,
    'pilot_end_date', v_new_pilot
  );

  -- Audit insert in the SAME transaction. If this fails, the UPDATE
  -- above rolls back too.
  INSERT INTO public.admin_audit_log
    (actor_id, action, target_org_id, target_user_id, before, after)
  VALUES
    (v_actor,
     'extend_trial',
     p_org_id,
     NULL,
     v_before,
     v_after || jsonb_build_object('days', p_days, 'branch', v_branch));

  RETURN jsonb_build_object('branch', v_branch, 'before', v_before, 'after', v_after);
END;
$$;

-- ------------------------------------------------------------
-- 3. set_feature_flag(p_org_id, p_flag, p_enabled)
--    Flips a single allow-listed flag in organizations.feature_flags.
--    p_flag is allow-listed INSIDE the function (mirror of the server
--    action's ALLOWED_FLAGS) so no arbitrary jsonb key can be written.
--    Writes an audit row capturing before/after of feature_flags.
--
--    RETURNS jsonb summary { flag, before, after }.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_feature_flag(
  p_org_id  UUID,
  p_flag    TEXT,
  p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_old     JSONB;
  v_new     JSONB;
  -- Hardcoded allowlist. Keep in sync with ALLOWED_FLAGS in the
  -- server action (lib/admin/featureFlags.ts).
  v_allowed TEXT[] := ARRAY[
    'beta_dashboard',
    'advanced_reports',
    'bulk_export'
  ];
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT (p_flag = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'invalid_flag: %', p_flag USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(feature_flags, '{}'::jsonb)
    INTO v_old
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: %', p_org_id USING ERRCODE = 'P0002';
  END IF;

  -- Set exactly one key; leave all other keys intact.
  v_new := v_old || jsonb_build_object(p_flag, p_enabled);

  UPDATE public.organizations
     SET feature_flags = v_new,
         updated_at    = now()
   WHERE id = p_org_id;

  INSERT INTO public.admin_audit_log
    (actor_id, action, target_org_id, target_user_id, before, after)
  VALUES
    (v_actor,
     'set_feature_flag',
     p_org_id,
     NULL,
     jsonb_build_object('feature_flags', v_old),
     jsonb_build_object('feature_flags', v_new, 'flag', p_flag, 'enabled', p_enabled));

  RETURN jsonb_build_object('flag', p_flag, 'before', v_old, 'after', v_new);
END;
$$;

-- ------------------------------------------------------------
-- 4. Execution grants.
--    These functions are SECURITY DEFINER and re-check is_super_admin()
--    internally, so it is safe to let authenticated callers invoke
--    them: a non-admin caller is rejected by the in-function check
--    before any mutation. (revoke from anon to be tidy.)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.extend_trial(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_feature_flag(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_trial(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_feature_flag(UUID, TEXT, BOOLEAN) TO authenticated;
