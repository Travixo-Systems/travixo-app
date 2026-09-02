CREATE OR REPLACE FUNCTION public.generate_vgp_alerts()
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  schedule_record RECORD;
  alert_dates INTEGER[] := ARRAY[30, 15, 7, 1];
  alert_date DATE;
  alert_type TEXT;
BEGIN
  -- Loop through all active schedules
  FOR schedule_record IN 
    SELECT * FROM vgp_schedules 
    WHERE status = 'active' AND next_due_date IS NOT NULL
  LOOP
    -- Generate alerts for each threshold
    FOREACH alert_date IN ARRAY alert_dates
    LOOP
      alert_date := schedule_record.next_due_date - (alert_date || ' days')::INTERVAL;
      
      CASE alert_date
        WHEN 30 THEN alert_type := '30_days';
        WHEN 15 THEN alert_type := '15_days';
        WHEN 7 THEN alert_type := '7_days';
        WHEN 1 THEN alert_type := '1_day';
      END CASE;
      
      -- Insert alert if it doesn't exist and date hasn't passed
      INSERT INTO vgp_alerts (asset_id, schedule_id, organization_id, alert_type, alert_date, due_date)
      SELECT 
        schedule_record.asset_id,
        schedule_record.id,
        schedule_record.organization_id,
        alert_type,
        alert_date,
        schedule_record.next_due_date
      WHERE alert_date >= CURRENT_DATE
      ON CONFLICT DO NOTHING;
    END LOOP;
    
    -- Check if overdue
    IF schedule_record.next_due_date < CURRENT_DATE THEN
      UPDATE vgp_schedules 
      SET status = 'overdue' 
      WHERE id = schedule_record.id;
      
      -- Create overdue alert
      INSERT INTO vgp_alerts (asset_id, schedule_id, organization_id, alert_type, alert_date, due_date)
      VALUES (
        schedule_record.asset_id,
        schedule_record.id,
        schedule_record.organization_id,
        'overdue',
        CURRENT_DATE,
        schedule_record.next_due_date
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."generate_vgp_alerts"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."generate_vgp_alerts"() FROM PUBLIC;
