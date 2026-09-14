CREATE OR REPLACE FUNCTION public.claim_vgp_alerts (
  p_rows jsonb
)
  RETURNS TABLE (
    out_id          uuid,
    out_schedule_id uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  INSERT INTO public.vgp_alerts (
    schedule_id, asset_id, organization_id, alert_type, urgency_level,
    alert_date, due_date, sent, sent_at, email_sent_to, resolved
  )
  SELECT
    (r->>'schedule_id')::UUID,
    NULLIF(r->>'asset_id', '')::UUID,
    NULLIF(r->>'organization_id', '')::UUID,
    r->>'alert_type',
    r->>'urgency_level',
    (r->>'alert_date')::DATE,
    (r->>'due_date')::DATE,
    TRUE,
    COALESCE((r->>'sent_at')::TIMESTAMPTZ, now()),
    -- email_sent_to is text[]; the caller sends a JSON array of addresses.
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(r->'email_sent_to')),
      ARRAY[]::TEXT[]
    ),
    FALSE
  FROM jsonb_array_elements(p_rows) AS r
  -- The predicate is what makes the partial index usable as the arbiter.
  -- Without it this statement raises 42P10, which is the outage being fixed.
  ON CONFLICT (schedule_id, alert_type, alert_date) WHERE vgp_alerts.sent = true
  DO NOTHING
  RETURNING vgp_alerts.id, vgp_alerts.schedule_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_vgp_alerts"(jsonb) TO "postgres", "service_role";

COMMENT ON FUNCTION "public"."claim_vgp_alerts"(jsonb) IS 'Claim a batch of VGP alerts for sending, returning only the rows actually inserted. Rows already claimed for the same (schedule_id, alert_type, alert_date) are skipped. Exists because ON CONFLICT against the PARTIAL index idx_vgp_alerts_dedup_unique must repeat its WHERE predicate, which PostgREST cannot express.';

REVOKE ALL ON FUNCTION "public"."claim_vgp_alerts"(jsonb) FROM PUBLIC;
