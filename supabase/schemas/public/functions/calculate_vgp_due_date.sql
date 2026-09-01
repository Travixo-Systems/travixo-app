CREATE OR REPLACE FUNCTION public.calculate_vgp_due_date (
  last_inspection date,
  interval_months integer
)
  RETURNS date
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  RETURN (last_inspection + (interval_months || ' months')::INTERVAL)::DATE;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."calculate_vgp_due_date"(date, integer) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."calculate_vgp_due_date"(date, integer) FROM PUBLIC;
