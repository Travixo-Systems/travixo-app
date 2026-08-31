-- ============================================================
-- TraviXO Platform Admin - end_pilot + extend_trial date sync
-- Date: 2026-08-27
-- Purpose:
--   1. end_pilot(org, mode)  - end a pilot early, deliberately
--   2. extend_trial(...)     - REPLACED to fix a date desync bug
--
-- ------------------------------------------------------------
-- WHY end_pilot EXISTS
-- ------------------------------------------------------------
--
-- Before this migration a platform admin could only ever be generous:
-- extend_trial moves a date forward and the SQL refuses to shorten it.
-- That left no supported way to end a pilot for a fraudulent signup, a
-- duplicate org, or a customer who asked to stop. The only remaining
-- tool was hand-editing organizations in the Supabase dashboard, which
-- writes no audit row and is the actual risk this function removes.
--
-- ------------------------------------------------------------
-- WHY THERE ARE TWO MODES
-- ------------------------------------------------------------
--
-- lib/billing/access-model.ts defines three access levels, and the
-- middle one is a deliberate conversion mechanic:
--
--   day 0  .. 30    'full'       everything works
--   day 30 .. 45    'read_only'  whole app readable, no writes
--   day 45+         'locked'     nothing but /settings/subscription
--
-- The read-only window exists so a depot manager sees the fleet he
-- built, frozen, rather than a generic paywall. Ending a pilot straight
-- into 'locked' throws that away. So:
--
--   mode 'read_only'  (default)  -> the natural day-30 state
--   mode 'locked'                -> the natural day-45 state
--
-- 'read_only' is what an admin almost always wants. 'locked' is for
-- abuse, and the UI asks for it separately.
--
-- ------------------------------------------------------------
-- HOW THIS AVOIDS CONFLICTING WITH NORMAL DAY COUNTING
-- ------------------------------------------------------------
--
-- This function does NOT introduce a new "terminated" flag or a fourth
-- access level. It moves the SAME dates the natural lifecycle already
-- reads, so accessLevel() reaches its verdict through exactly the code
-- path that runs for an org nobody ever touched:
--
--   read_only: pilot_end_date := now()      (isPilotActive -> false)
--   locked:    pilot_end_date := now()  AND
--              pilot_start_date := now() - (PILOT_LOCKOUT_DAYS + 1) days
--              (daysSincePilotStart > 45 -> 'locked')
--
-- Because the intervals are derived from the same 30/15 constants the
-- app uses, an ended pilot is indistinguishable from a naturally
-- expired one, and no other org's day counting is affected. Nothing
-- else in the schema reads a "was this ended early" signal -- the audit
-- log is the record of that, which is where it belongs.
--
-- ------------------------------------------------------------
-- THE extend_trial BUG THIS ALSO FIXES
-- ------------------------------------------------------------
--
-- lib/billing/access-model.ts states that trial_ends_at and
-- pilot_end_date are identical for every organization, always, and
-- warns against letting them drift. The Phase 2 extend_trial broke
-- that invariant on its own pilot branch:
--
--     v_new_trial := v_old_trial;  -- untouched
--
-- so extending a pilot by 30 days left trial_ends_at 30 days behind
-- pilot_end_date. trial_ends_at drives no runtime access decision, so
-- this was never an access bug -- but the admin screens DISPLAY it
-- ("Trial ends" on both the org list and the org detail), so an admin
-- read a stale date for any org they had extended. The replacement
-- below writes both columns on the pilot branch.
--
-- Idempotent: CREATE OR REPLACE throughout.
-- ============================================================

-- ------------------------------------------------------------
-- 1. extend_trial(p_org_id, p_days) - REPLACED
--
--    Identical to the Phase 2 version except that the pilot branch now
--    advances trial_ends_at alongside pilot_end_date, keeping the two
--    columns in the lockstep access-model.ts documents.
--
--    Still never shortens: both values anchor at GREATEST(now(), current).
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
    -- Keep trial_ends_at in lockstep with pilot_end_date. The admin
    -- screens display trial_ends_at; letting it lag showed a stale date.
    v_new_trial := v_new_pilot;

    UPDATE public.organizations
       SET pilot_end_date = v_new_pilot,
           trial_ends_at  = v_new_trial,
           updated_at     = now()
     WHERE id = p_org_id;
  ELSE
    v_branch := 'trial';
    v_new_trial := GREATEST(now(), COALESCE(v_old_trial, now()))
                   + make_interval(days => p_days);
    v_new_pilot := v_old_pilot;  -- untouched: a non-pilot org has no pilot window

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
-- 2. end_pilot(p_org_id, p_mode)
--
--    Ends a running pilot immediately.
--
--    p_mode allowlisted to {'read_only','locked'}:
--      'read_only' -> pilot_end_date := now()
--                     (org lands in the natural day-30 grace window)
--      'locked'    -> also backdates pilot_start_date past the 45-day
--                     lockout so accessLevel() returns 'locked'
--
--    REFUSES when converted_to_paid is true. A paying customer must
--    never lose access to a misclick on this screen -- that is the one
--    failure here that cannot be walked back in reputation terms.
--    Enforced in SQL, not only in the server action.
--
--    REFUSES when is_pilot is false: there is no pilot to end, and
--    silently rewriting a non-pilot org's dates would be a surprise.
--
--    trial_ends_at moves with pilot_end_date for the same reason as
--    above: the admin screens display it.
--
--    RETURNS jsonb summary { mode, before, after }.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_pilot(
  p_org_id UUID,
  p_mode   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_is_pilot   BOOLEAN;
  v_converted  BOOLEAN;
  v_old_trial  TIMESTAMPTZ;
  v_old_pilot  TIMESTAMPTZ;
  v_old_start  TIMESTAMPTZ;
  v_new_start  TIMESTAMPTZ;
  v_now        TIMESTAMPTZ := now();
  -- The END of the pilot window, written to pilot_end_date.
  --
  -- It is now() MINUS a second, not now(), because isPilotActive() in
  -- lib/billing/access-model.ts tests `now <= pilot_end_date` -- an
  -- INCLUSIVE comparison. Writing exactly now() therefore leaves the
  -- pilot ACTIVE and the org at 'full' access: the function would report
  -- success and change nothing. Backing off one second puts the end
  -- strictly in the past, which is what "ended" has to mean.
  --
  -- Verified by scripts/verify-admin-end-pilot.mjs, which runs the real
  -- accessLevel() over the exact columns this function writes.
  v_end        TIMESTAMPTZ := now() - INTERVAL '1 second';
  v_before     JSONB;
  v_after      JSONB;
  -- Mirrors PILOT_LOCKOUT_DAYS (30 full + 15 grace) in
  -- lib/billing/access-model.ts. Backdating by one day MORE than the
  -- lockout satisfies the strict `> PILOT_LOCKOUT_DAYS` comparison.
  v_lockout_days CONSTANT INTEGER := 45;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_mode NOT IN ('read_only', 'locked') THEN
    RAISE EXCEPTION 'invalid_mode: %', p_mode USING ERRCODE = '22023';
  END IF;

  SELECT is_pilot, converted_to_paid, trial_ends_at, pilot_end_date, pilot_start_date
    INTO v_is_pilot, v_converted, v_old_trial, v_old_pilot, v_old_start
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: %', p_org_id USING ERRCODE = 'P0002';
  END IF;

  -- A paying customer is never degraded by this action.
  IF v_converted THEN
    RAISE EXCEPTION 'already_converted' USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_pilot THEN
    RAISE EXCEPTION 'not_a_pilot' USING ERRCODE = '22023';
  END IF;

  IF p_mode = 'locked' THEN
    -- Push the start date far enough back that daysSincePilotStart
    -- exceeds PILOT_LOCKOUT_DAYS, which is what accessLevel() tests.
    v_new_start := v_now - make_interval(days => v_lockout_days + 1);
  ELSE
    v_new_start := v_old_start;  -- untouched: grace is measured from it
  END IF;

  UPDATE public.organizations
     SET pilot_end_date   = v_end,
         trial_ends_at    = v_end,
         pilot_start_date = v_new_start,
         updated_at       = v_now
   WHERE id = p_org_id;

  v_before := jsonb_build_object(
    'trial_ends_at',    v_old_trial,
    'pilot_end_date',   v_old_pilot,
    'pilot_start_date', v_old_start
  );
  v_after := jsonb_build_object(
    'trial_ends_at',    v_end,
    'pilot_end_date',   v_end,
    'pilot_start_date', v_new_start
  );

  -- Audit insert in the SAME transaction. If this fails, the UPDATE
  -- above rolls back too.
  INSERT INTO public.admin_audit_log
    (actor_id, action, target_org_id, target_user_id, before, after)
  VALUES
    (v_actor,
     'end_pilot',
     p_org_id,
     NULL,
     v_before,
     v_after || jsonb_build_object('mode', p_mode));

  RETURN jsonb_build_object('mode', p_mode, 'before', v_before, 'after', v_after);
END;
$$;

-- ------------------------------------------------------------
-- 3. Execution grants.
--    SECURITY DEFINER + in-function is_super_admin() re-check means a
--    non-admin caller is rejected before any mutation, so granting
--    EXECUTE to authenticated is safe (same reasoning as Phase 2).
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.end_pilot(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_pilot(UUID, TEXT) TO authenticated;
