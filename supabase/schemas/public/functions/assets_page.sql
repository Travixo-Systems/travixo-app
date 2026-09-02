CREATE OR REPLACE FUNCTION public.assets_page (
  p_search        text    DEFAULT NULL::text,
  p_status        text    DEFAULT NULL::text,
  p_category_id   uuid    DEFAULT NULL::uuid,
  p_show_archived boolean DEFAULT false,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0
)
  RETURNS TABLE (
    id               uuid,
    name             text,
    serial_number    text,
    description      text,
    status           text,
    current_location text,
    category_id      uuid,
    category_name    text,
    qr_code          text,
    purchase_date    date,
    purchase_price   numeric,
    current_value    numeric,
    archived_at      timestamp with time zone,
    archive_reason   text,
    vgp_status       text,
    total_count      bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  WITH scoped AS (
    SELECT a.*,
           c.name AS category_name,
           -- Most urgent non-archived schedule decides the badge. NULL when the
           -- asset has none, which the client renders as 'unknown'.
           (
             SELECT MIN(s.next_due_date)
             FROM public.vgp_schedules s
             WHERE s.asset_id = a.id
               AND s.archived_at IS NULL
           ) AS soonest_due
    FROM public.assets a
    LEFT JOIN public.asset_categories c ON c.id = a.category_id
    WHERE a.organization_id = public.get_my_organization_id()
      AND (p_show_archived OR a.archived_at IS NULL)
      AND (p_status IS NULL OR p_status = 'all' OR a.status = p_status)
      AND (p_category_id IS NULL OR a.category_id = p_category_id)
      AND (
        p_search IS NULL OR p_search = '' OR
        a.name             ILIKE '%' || p_search || '%' OR
        a.serial_number    ILIKE '%' || p_search || '%' OR
        a.description      ILIKE '%' || p_search || '%' OR
        a.current_location ILIKE '%' || p_search || '%'
      )
  )
  SELECT s.id,
         s.name::TEXT,
         s.serial_number::TEXT,
         s.description::TEXT,
         s.status::TEXT,
         s.current_location::TEXT,
         s.category_id,
         s.category_name::TEXT,
         s.qr_code::TEXT,
         s.purchase_date,
         s.purchase_price,
         s.current_value,
         s.archived_at,
         s.archive_reason::TEXT,
         CASE
           WHEN s.soonest_due IS NULL                          THEN 'unknown'
           WHEN s.soonest_due <  CURRENT_DATE                  THEN 'overdue'
           WHEN s.soonest_due <= CURRENT_DATE + INTERVAL '30 days' THEN 'upcoming'
           ELSE 'compliant'
         END::TEXT AS vgp_status,
         COUNT(*) OVER ()::BIGINT AS total_count
  FROM scoped s
  ORDER BY s.created_at DESC
  LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$function$;

GRANT EXECUTE ON FUNCTION "public"."assets_page"(text, text, uuid, boolean, integer, integer) TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."assets_page"(text, text, uuid, boolean, integer, integer) IS 'One filtered, searched, paginated page of assets for the calling user''s organization, with vgp_status computed server-side and total_count for the pager. Limit is clamped to 200.';

REVOKE ALL ON FUNCTION "public"."assets_page"(text, text, uuid, boolean, integer, integer) FROM PUBLIC;
