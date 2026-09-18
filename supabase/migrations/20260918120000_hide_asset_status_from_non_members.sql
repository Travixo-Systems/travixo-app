-- 20260918120000_hide_asset_status_from_non_members.sql
--   APPLIED to production 2026-09-18 via the SQL editor, then the schema
--   mirror was refreshed with `npx supabase db pull --declarative`.
--   Verified afterwards with the anon key against a live QR code:
--     ANONYMOUS  status null        MEMBER  status "available"
--
-- Stop the public QR scan lookup from returning a machine's operational
-- status to anyone who is not a same-org member.
--
-- ---------------------------------------------------------------------------
-- WHAT IS THERE NOW (from supabase/schemas/public/functions/get_asset_by_qr.sql)
-- ---------------------------------------------------------------------------
-- get_asset_by_qr is SECURITY DEFINER and granted to anon, so it deliberately
-- bypasses RLS on assets: that is the point, a QR sticker has to resolve for
-- someone who is not logged in.
--
-- It already withholds two classes of data from non-members:
--
--   * purchase_price, current_value and organization_id are not in the
--     RETURNS TABLE at all -- no caller can ask for them.
--   * purchase_date is returned as NULL unless the caller is a same-org
--     member, via a CASE on the same subquery that computes viewer_is_member.
--
-- status is returned unconditionally, to everybody:
--
--   a.status::text,
--
-- ---------------------------------------------------------------------------
-- WHY THAT IS WRONG
-- ---------------------------------------------------------------------------
-- status is operational state, not identity: 'available', 'in_use',
-- 'maintenance', 'out_of_service'. A QR label lives on the machine, in public,
-- often on a site the org does not control. Anyone who photographs it learns
-- whether that machine is currently working, idle or broken -- and 'maintenance'
-- or 'out_of_service' on a machine sitting on a site is exactly the detail a
-- competitor or a thief benefits from.
--
-- The page has always been careful about money. It was not careful about this.
--
-- ---------------------------------------------------------------------------
-- THE CHANGE
-- ---------------------------------------------------------------------------
-- status follows purchase_date: NULL for non-members, real value for members.
-- The column stays in the signature so the shape does not change and the one
-- caller keeps type-checking; only its value narrows.
--
-- Identity is untouched -- name, serial_number, current_location, description
-- and category_name still resolve for anonymous scanners, because a QR code
-- that cannot tell you which machine you are standing in front of is useless.
--
-- ---------------------------------------------------------------------------
-- CALLERS
-- ---------------------------------------------------------------------------
-- app/scan/[qr_code]/page.tsx is the only caller (grep, 2026-09-18). It uses
-- status for the badge and to seed the status-update form; both are already
-- behind viewer_is_member / isAuthenticated after the matching UI change, so
-- a NULL here is rendered, not crashed on.
--
-- ---------------------------------------------------------------------------
-- REVERSAL
-- ---------------------------------------------------------------------------
-- Re-run the previous body, replacing the status CASE with a.status::text.
-- No data is written or destroyed by this migration.
-- ===========================================================================

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
    -- operational state only for same-org members; see header
    CASE
      WHEN a.organization_id IN (
        SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
      ) THEN a.status::text
      ELSE NULL
    END AS status,
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

COMMENT ON FUNCTION "public"."get_asset_by_qr"(text) IS 'Public QR scan lookup. Returns display-safe columns for one asset. Never returns purchase_price, current_value, or organization_id. purchase_date and status are NULL unless the caller is an authenticated same-org member.';

REVOKE ALL ON FUNCTION "public"."get_asset_by_qr"(text) FROM PUBLIC;
