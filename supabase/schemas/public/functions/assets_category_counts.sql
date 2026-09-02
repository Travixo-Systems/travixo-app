CREATE OR REPLACE FUNCTION public.assets_category_counts()
  RETURNS TABLE (
    id    uuid,
    name  text,
    count bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT a.category_id,
         COALESCE(c.name, 'Unknown')::TEXT,
         COUNT(*)::BIGINT
  FROM public.assets a
  LEFT JOIN public.asset_categories c ON c.id = a.category_id
  WHERE a.organization_id = public.get_my_organization_id()
    AND a.category_id IS NOT NULL
  GROUP BY a.category_id, c.name
  ORDER BY 2;
$function$;

GRANT EXECUTE ON FUNCTION "public"."assets_category_counts"() TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."assets_category_counts"() IS 'Category filter list with per-category asset counts for the calling user''s organization. Includes archived assets, matching the current UI.';

REVOKE ALL ON FUNCTION "public"."assets_category_counts"() FROM PUBLIC;
