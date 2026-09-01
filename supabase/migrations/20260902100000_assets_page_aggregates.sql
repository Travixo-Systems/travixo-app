-- 20260902100000_assets_page_aggregates.sql   -- PROPOSED, not applied
--
-- Server-side aggregates for the assets page, so the list can be paginated.
--
-- ---------------------------------------------------------------------------
-- WHY THIS HAS TO COME FIRST
-- ---------------------------------------------------------------------------
-- The assets list is unpaginated because three things on that page are derived
-- from the WHOLE fleet, not from the visible rows:
--
--   1. the status counts above the table (all / available / in_use /
--      maintenance / retired)
--   2. the category filter list, with a per-category count
--   3. the search box, which matches on `description` -- a column no table
--      column displays
--
-- Adding .range() without moving those server-side would silently change what
-- they mean: the counts would describe page 1 rather than the fleet, and
-- searching would only find matches already on screen. That is the same trap
-- documented in components/vgp/VGPSchedulesManager.tsx:104-125, where the
-- client deliberately walks every page for exactly this reason.
--
-- So: aggregates first, pagination second.
--
-- ---------------------------------------------------------------------------
-- FIDELITY TO THE CURRENT BEHAVIOUR
-- ---------------------------------------------------------------------------
-- These functions reproduce what the client computes today, including one
-- asymmetry that looks like a bug but is load-bearing enough to preserve
-- rather than quietly "fix":
--
--   status counts  EXCLUDE archived assets  (AssetsPageClient.tsx:216)
--   category list  INCLUDES archived assets (AssetsPageClient.tsx:233)
--
-- If that asymmetry is wrong it should be changed deliberately, in its own
-- change, with the UI reviewed. It is not this migration's job to decide.
--
-- vgp_status thresholds also match the client exactly
-- (AssetsPageClient.tsx:148-162): overdue when the nearest non-archived
-- schedule is in the past, upcoming within 30 days, otherwise compliant, and
-- 'unknown' when the asset has no active schedule. Archived schedules are
-- ignored, and the most urgent schedule wins.
--
-- ---------------------------------------------------------------------------
-- SECURITY
-- ---------------------------------------------------------------------------
-- Every function is org-scoped through get_my_organization_id(), the existing
-- helper, rather than taking an organization id as an argument. A caller
-- therefore cannot ask for another tenant's counts by passing a different id.
-- SECURITY DEFINER with a pinned search_path, matching the convention in
-- get_my_organization_id.sql, and EXECUTE granted only to authenticated.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Status counts for the caller's organization
-- ---------------------------------------------------------------------------
-- Replaces the statusCounts useMemo. Excludes archived, as the client does.
CREATE OR REPLACE FUNCTION public.assets_status_counts()
RETURNS TABLE (
  status TEXT,
  count  BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT a.status::TEXT, COUNT(*)::BIGINT
  FROM public.assets a
  WHERE a.organization_id = public.get_my_organization_id()
    AND a.archived_at IS NULL
  GROUP BY a.status;
$$;

COMMENT ON FUNCTION public.assets_status_counts() IS
  'Per-status asset counts for the calling user''s organization, excluding '
  'archived. Backs the filter chips on the assets page.';

-- ---------------------------------------------------------------------------
-- 2. Category list with counts
-- ---------------------------------------------------------------------------
-- Replaces the categories useMemo. INCLUDES archived, as the client does.
-- Sorted by name so the dropdown order does not depend on the client locale
-- comparator it currently uses.
CREATE OR REPLACE FUNCTION public.assets_category_counts()
RETURNS TABLE (
  id    UUID,
  name  TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT a.category_id,
         COALESCE(c.name, 'Unknown')::TEXT,
         COUNT(*)::BIGINT
  FROM public.assets a
  LEFT JOIN public.asset_categories c ON c.id = a.category_id
  WHERE a.organization_id = public.get_my_organization_id()
    AND a.category_id IS NOT NULL
  GROUP BY a.category_id, c.name
  ORDER BY 2;
$$;

COMMENT ON FUNCTION public.assets_category_counts() IS
  'Category filter list with per-category asset counts for the calling '
  'user''s organization. Includes archived assets, matching the current UI.';

-- ---------------------------------------------------------------------------
-- 3. One paginated, filtered, searched page of assets
-- ---------------------------------------------------------------------------
-- Replaces the unpaginated select plus the client-side filter/search/slice.
--
-- Every filter the client applies is a parameter, so the server can answer
-- with exactly the rows the table draws. total_count comes back on each row
-- (window function, not a second query) so the pager knows how many pages
-- exist without a separate round trip.
--
-- p_search matches name, serial_number, description and current_location,
-- the same four fields as the client, case-insensitively.
CREATE OR REPLACE FUNCTION public.assets_page(
  p_search        TEXT    DEFAULT NULL,
  p_status        TEXT    DEFAULT NULL,   -- NULL or 'all' = no status filter
  p_category_id   UUID    DEFAULT NULL,
  p_show_archived BOOLEAN DEFAULT FALSE,
  p_limit         INTEGER DEFAULT 50,
  p_offset        INTEGER DEFAULT 0
)
RETURNS TABLE (
  id               UUID,
  name             TEXT,
  serial_number    TEXT,
  description      TEXT,
  status           TEXT,
  current_location TEXT,
  category_id      UUID,
  category_name    TEXT,
  qr_code          TEXT,
  purchase_date    DATE,
  purchase_price   NUMERIC,
  current_value    NUMERIC,
  archived_at      TIMESTAMPTZ,
  archive_reason   TEXT,
  vgp_status       TEXT,
  total_count      BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
$$;

COMMENT ON FUNCTION public.assets_page(TEXT, TEXT, UUID, BOOLEAN, INTEGER, INTEGER) IS
  'One filtered, searched, paginated page of assets for the calling user''s '
  'organization, with vgp_status computed server-side and total_count for the '
  'pager. Limit is clamped to 200.';

-- ---------------------------------------------------------------------------
-- Grants: authenticated only. These read tenant data and must never be
-- reachable by anon.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.assets_status_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assets_category_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assets_page(TEXT, TEXT, UUID, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assets_status_counts()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assets_category_counts()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assets_page(TEXT, TEXT, UUID, BOOLEAN, INTEGER, INTEGER)
  TO authenticated, service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- Run as an AUTHENTICATED user, not the service role: these scope through
-- get_my_organization_id(), which reads auth.uid() and returns NULL for the
-- service role, so every function correctly returns nothing there.
--
-- 1. Counts match what the page shows today:
--
--   SELECT * FROM public.assets_status_counts();
--   SELECT * FROM public.assets_category_counts();
--
-- 2. A page comes back with a sane total:
--
--   SELECT id, name, vgp_status, total_count
--   FROM public.assets_page(NULL, 'all', NULL, false, 50, 0);
--
-- 3. Search reaches description, which no table column displays -- this is the
--    behaviour that would have been lost to naive pagination:
--
--   SELECT name, description, total_count
--   FROM public.assets_page('moteur', 'all', NULL, false, 50, 0);
--
-- 4. Tenant isolation: signed in as a user from another organization, the same
--    calls must return that organization's rows and never these.
