-- 20260903100000_record_inspection_rpc.sql   -- PROPOSED, not applied
--
-- Make recording a VGP inspection atomic.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A SAFETY FIX, NOT A PERFORMANCE ONE
-- ---------------------------------------------------------------------------
-- app/api/vgp/inspections/route.ts writes three tables in sequence with no
-- transaction, and swallows two of the three failures:
--
--   1. INSERT vgp_inspections                     -- fails the request
--   2. UPDATE vgp_schedules  (next due, status)   -- "Don't fail entire
--                                                     request if schedule
--                                                     update fails"
--   3. UPDATE assets -> out_of_service, but ONLY when result = 'failed'
--                                                  -- also swallowed
--
-- The dangerous combination is 1 succeeding and 3 failing. A FAILED inspection
-- is then on record while the machine still reads `available`, so checkout's
-- VGP gate lets it out to a customer. The person who recorded the failure has
-- every reason to believe the system acted on it.
--
-- The 1-succeeds-2-fails case is quieter but still wrong: the inspection
-- exists, the schedule still shows the old due date, and the compliance
-- dashboard reports equipment as overdue that was just inspected.
--
-- One function, one transaction. Either all three writes land or none do.
--
-- ---------------------------------------------------------------------------
-- FIDELITY TO THE CURRENT ROUTE
-- ---------------------------------------------------------------------------
-- The next-due arithmetic is reproduced exactly as route.ts:218-232 computes
-- it, because the two must not disagree:
--
--   failed       -> inspection_date + 30 days
--   conditional  -> inspection_date + 6 months
--   passed       -> inspection_date + interval_months, default 12
--
-- Schedule status mapping, from route.ts:270-276:
--
--   passed | conditional -> 'completed'
--   failed              -> 'failed'
--
-- Asset status: only a 'failed' result changes it, to 'out_of_service'.
-- 'conditional' deliberately leaves the asset alone -- verified against a real
-- inspection on 2026-09-02, where a conditional result correctly left a Bobcat
-- S650 in_use.
--
-- ---------------------------------------------------------------------------
-- SECURITY
-- ---------------------------------------------------------------------------
-- Org-scoped through get_my_organization_id() rather than taking an
-- organization id, so a caller cannot write an inspection into another
-- tenant's fleet. The asset and schedule are both re-checked as belonging to
-- that org before anything is written.
--
-- SECURITY DEFINER with a pinned search_path, and EXECUTE revoked from anon --
-- default privileges grant it otherwise. See docs/working-agreements.md.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_inspection(
  p_asset_id              UUID,
  p_inspection_date       DATE,
  p_inspector_name        TEXT,
  p_result                TEXT,
  p_certificate_url       TEXT,
  p_schedule_id           UUID    DEFAULT NULL,
  p_inspector_company     TEXT    DEFAULT NULL,
  p_certification_number  TEXT    DEFAULT NULL,
  p_findings              TEXT    DEFAULT NULL,
  p_verification_type     TEXT    DEFAULT 'PERIODIQUE',
  p_interval_months       INTEGER DEFAULT 12,
  p_certificate_file_name TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
$$;

COMMENT ON FUNCTION public.record_inspection(UUID, DATE, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) IS
  'Record a VGP inspection and its consequences in ONE transaction: the '
  'inspection row, the schedule advance, and out_of_service on a failed '
  'result. Replaces three sequential writes where two failures were swallowed.';

REVOKE ALL ON FUNCTION public.record_inspection(UUID, DATE, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_inspection(UUID, DATE, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_inspection(UUID, DATE, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT)
  TO authenticated, service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- Run as an AUTHENTICATED user; the function scopes through auth.uid().
--
-- 1. anon is refused outright:
--
--   curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/record_inspection" \
--     -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{}'
--
--   Expect 401 permission denied, not a validation error.
--
-- 2. A conditional inspection advances the schedule 6 months and leaves the
--    asset alone:
--
--   SELECT public.record_inspection(
--     '<asset-uuid>', CURRENT_DATE, 'Test Inspector', 'conditional',
--     'https://example.invalid/cert.pdf', '<schedule-uuid>');
--
--   Then confirm vgp_schedules.next_due_date = CURRENT_DATE + 6 months,
--   status = 'completed', and assets.status unchanged.
--
-- 3. Atomicity, which is the whole point. Force the third write to fail and
--    confirm the inspection did NOT persist:
--
--   BEGIN;
--     -- point the asset at another org so the final UPDATE matches 0 rows
--     -- (or add a temporary CHECK that rejects out_of_service)
--     SELECT public.record_inspection(..., 'failed', ...);
--   ROLLBACK;
--
--   Under the old route the inspection row survived a failed asset update.
--   Here there is nothing to survive: one transaction, all or nothing.
--
-- 4. Cross-tenant refusal: pass an asset id from another organization and
--    expect asset_not_found rather than a write.
