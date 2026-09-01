CREATE OR REPLACE FUNCTION public.is_super_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = auth.uid()
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."is_super_admin"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";
