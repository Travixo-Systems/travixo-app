CREATE OR REPLACE FUNCTION public.assets_status_counts()
  RETURNS TABLE (
    status text,
    count  bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT a.status::TEXT, COUNT(*)::BIGINT
  FROM public.assets a
  WHERE a.organization_id = public.get_my_organization_id()
    AND a.archived_at IS NULL
  GROUP BY a.status;
$function$;

GRANT EXECUTE ON FUNCTION "public"."assets_status_counts"() TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."assets_status_counts"() IS 'Per-status asset counts for the calling user''s organization, excluding archived. Backs the filter chips on the assets page.';

REVOKE ALL ON FUNCTION "public"."assets_status_counts"() FROM PUBLIC;
