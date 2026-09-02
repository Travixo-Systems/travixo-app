CREATE OR REPLACE FUNCTION public.get_asset_by_qr (
  p_qr_code text
)
  RETURNS TABLE (
    id               uuid,
    name             text,
    serial_number    text,
    status           text,
    current_location text,
    description      text,
    purchase_date    date,
    last_seen_at     timestamp with time zone,
    category_name    text,
    viewer_is_member boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT
    a.id,
    a.name::text,
    a.serial_number::text,
    a.status::text,
    a.current_location::text,
    a.description::text,
    -- financial/date detail only for same-org authenticated members
    CASE
      WHEN a.organization_id IN (
        SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
      ) THEN a.purchase_date
      ELSE NULL
    END AS purchase_date,
    a.last_seen_at,
    c.name::text AS category_name,
    (
      a.organization_id IN (
        SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
      )
    ) IS TRUE AS viewer_is_member
  FROM public.assets a
  LEFT JOIN public.asset_categories c ON c.id = a.category_id
  WHERE a.qr_code = p_qr_code
    AND a.archived_at IS NULL
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_asset_by_qr"(text) TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."get_asset_by_qr"(text) IS 'Public QR scan lookup. Returns display-safe columns for one asset. Never returns purchase_price, current_value, or organization_id. purchase_date is NULL unless the caller is an authenticated same-org member.';

REVOKE ALL ON FUNCTION "public"."get_asset_by_qr"(text) FROM PUBLIC;
