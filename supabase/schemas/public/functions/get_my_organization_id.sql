CREATE OR REPLACE FUNCTION public.get_my_organization_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT organization_id FROM public.users WHERE id = auth.uid()
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_my_organization_id"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."get_my_organization_id"() FROM PUBLIC;
