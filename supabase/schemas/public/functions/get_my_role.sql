CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT role::text FROM public.users WHERE id = auth.uid() $function$;

GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."get_my_role"() IS 'Returns the calling user''s role, read without re-triggering RLS. Sibling of get_my_organization_id(). Exists so a policy on public.users can compare a NEW value against the caller''s current role without recursive policy evaluation.';

REVOKE ALL ON FUNCTION "public"."get_my_role"() FROM PUBLIC;
