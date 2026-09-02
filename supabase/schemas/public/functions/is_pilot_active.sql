CREATE OR REPLACE FUNCTION public.is_pilot_active (
  org_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT COALESCE(
    (SELECT is_pilot
            AND (pilot_start_date IS NULL OR NOW() >= pilot_start_date)
            AND (pilot_end_date   IS NULL OR NOW() <= pilot_end_date)
     FROM public.organizations
     WHERE id = org_id),
    false
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."is_pilot_active"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."is_pilot_active"(uuid) FROM PUBLIC;
