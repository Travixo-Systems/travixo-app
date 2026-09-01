CREATE OR REPLACE FUNCTION public.end_pilot (
  p_org_id uuid,
  p_mode   text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."end_pilot"(uuid, text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."end_pilot"(uuid, text) FROM PUBLIC;
