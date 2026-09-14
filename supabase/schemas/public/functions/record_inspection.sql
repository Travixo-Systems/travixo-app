CREATE OR REPLACE FUNCTION public.record_inspection (
  p_asset_id              uuid,
  p_inspection_date       date,
  p_inspector_name        text,
  p_result                text,
  p_certificate_url       text,
  p_schedule_id           uuid    DEFAULT NULL::uuid,
  p_inspector_company     text    DEFAULT NULL::text,
  p_certification_number  text    DEFAULT NULL::text,
  p_findings              text    DEFAULT NULL::text,
  p_verification_type     text    DEFAULT 'PERIODIQUE'::text,
  p_interval_months       integer DEFAULT 12,
  p_certificate_file_name text    DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_org        UUID := public.get_my_organization_id();
  v_actor      UUID := auth.uid();
  v_next_due   DATE;
  v_sched_stat TEXT;
  v_inspection JSONB;
  v_asset_ok   BOOLEAN;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no_organization' USING ERRCODE = '42501';
  END IF;

  IF p_result NOT IN ('passed', 'conditional', 'failed') THEN
    RAISE EXCEPTION 'invalid_result: %', p_result USING ERRCODE = '22023';
  END IF;

  -- The certificate is mandatory for DREETS compliance. Without it the
  -- inspection is not conformant, so refusing here rather than recording a
  -- half-valid inspection is the point.
  IF p_certificate_url IS NULL OR btrim(p_certificate_url) = '' THEN
    RAISE EXCEPTION 'certificate_required' USING ERRCODE = '22023';
  END IF;

  -- The asset must belong to the caller's organization. FOR UPDATE because we
  -- may be about to change its status, and two concurrent inspections of the
  -- same machine must not interleave.
  SELECT TRUE INTO v_asset_ok
  FROM public.assets
  WHERE id = p_asset_id AND organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asset_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Same for the schedule, when one was given.
  IF p_schedule_id IS NOT NULL THEN
    PERFORM 1
    FROM public.vgp_schedules
    WHERE id = p_schedule_id AND organization_id = v_org
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'schedule_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Next due date. Mirrors route.ts:218-232 exactly.
  v_next_due := CASE p_result
    WHEN 'failed'      THEN p_inspection_date + INTERVAL '30 days'
    WHEN 'conditional' THEN p_inspection_date + INTERVAL '6 months'
    ELSE p_inspection_date + make_interval(months => COALESCE(NULLIF(p_interval_months, 0), 12))
  END::DATE;

  v_sched_stat := CASE WHEN p_result = 'failed' THEN 'failed' ELSE 'completed' END;

  -- 1. The inspection itself.
  INSERT INTO public.vgp_inspections (
    asset_id, schedule_id, organization_id, inspection_date,
    inspector_name, inspector_company, certification_number,
    result, observations, verification_type, next_inspection_date,
    certificate_url, certificate_file_name, performed_by
  )
  VALUES (
    p_asset_id, p_schedule_id, v_org, p_inspection_date,
    p_inspector_name, p_inspector_company, p_certification_number,
    p_result, COALESCE(p_findings, ''), COALESCE(p_verification_type, 'PERIODIQUE'),
    v_next_due, p_certificate_url, p_certificate_file_name, v_actor
  )
  RETURNING to_jsonb(vgp_inspections.*) INTO v_inspection;

  -- 2. The schedule. No longer optional, no longer swallowed: if this fails
  --    the whole thing rolls back and the caller is told.
  IF p_schedule_id IS NOT NULL THEN
    UPDATE public.vgp_schedules
    SET next_due_date        = v_next_due,
        last_inspection_date = p_inspection_date,
        status               = v_sched_stat,
        updated_at           = now()
    WHERE id = p_schedule_id AND organization_id = v_org;
  END IF;

  -- 3. A failed inspection takes the machine out of service. This is the write
  --    whose silent failure could put uninspected equipment on a site.
  IF p_result = 'failed' THEN
    UPDATE public.assets
    SET status = 'out_of_service',
        updated_at = now()
    WHERE id = p_asset_id AND organization_id = v_org;
  END IF;

  RETURN jsonb_build_object(
    'inspection',    v_inspection,
    'next_due_date', v_next_due,
    'asset_blocked', (p_result = 'failed')
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_inspection"(uuid, date, text, text, text, uuid, text, text, text, text, integer, text) TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."record_inspection"(uuid, date, text, text, text, uuid, text, text, text, text, integer, text) IS 'Record a VGP inspection and its consequences in ONE transaction: the inspection row, the schedule advance, and out_of_service on a failed result. Replaces three sequential writes where two failures were swallowed.';

REVOKE ALL ON FUNCTION "public"."record_inspection"(uuid, date, text, text, text, uuid, text, text, text, text, integer, text) FROM PUBLIC;
