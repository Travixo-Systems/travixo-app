CREATE OR REPLACE FUNCTION public.update_vgp_schedule_after_inspection()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  UPDATE vgp_schedules
  SET 
    last_inspection_date = NEW.inspection_date,
    next_due_date = NEW.next_inspection_date,
    inspector_name = NEW.inspector_name,
    inspector_company = NEW.inspector_company,
    certification_number = NEW.certification_number,
    status = CASE 
      WHEN NEW.next_inspection_date < CURRENT_DATE THEN 'overdue'
      ELSE 'active'
    END,
    updated_at = NOW()
  WHERE id = NEW.schedule_id;
  
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."update_vgp_schedule_after_inspection"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."update_vgp_schedule_after_inspection"() FROM PUBLIC;
