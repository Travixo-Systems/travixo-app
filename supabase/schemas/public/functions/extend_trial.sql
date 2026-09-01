CREATE OR REPLACE FUNCTION public.extend_trial (
  p_org_id uuid,
  p_days   integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."extend_trial"(uuid, integer) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."extend_trial"(uuid, integer) FROM PUBLIC;
