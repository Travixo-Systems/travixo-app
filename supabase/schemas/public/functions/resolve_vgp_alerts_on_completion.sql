CREATE OR REPLACE FUNCTION public.resolve_vgp_alerts_on_completion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  -- When schedule is completed or archived, resolve all open alerts
  IF (NEW.status IN ('completed', 'archived') AND OLD.status NOT IN ('completed', 'archived')) THEN
    UPDATE vgp_alerts
    SET
      resolved = true,
      resolved_at = now(),
      resolved_reason = CASE
        WHEN NEW.status = 'completed' THEN 'inspection_completed'
        WHEN NEW.status = 'archived' THEN 'schedule_archived'
      END
    WHERE schedule_id = NEW.id
      AND resolved = false;
  END IF;

  -- When next_due_date is pushed forward (inspection done, new cycle),
  -- resolve alerts for the old due date
  IF (NEW.next_due_date > OLD.next_due_date AND NEW.last_inspection_date IS DISTINCT FROM OLD.last_inspection_date) THEN
    UPDATE vgp_alerts
    SET
      resolved = true,
      resolved_at = now(),
      resolved_reason = 'inspection_completed'
    WHERE schedule_id = NEW.id
      AND resolved = false;
  END IF;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."resolve_vgp_alerts_on_completion"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."resolve_vgp_alerts_on_completion"() FROM PUBLIC;
