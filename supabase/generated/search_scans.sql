-- search_scans: server-side search over public.scans.
--
-- GENERATED FILE -- do not edit by hand.
-- Source:    lib/search/manifest.ts
-- Generator: lib/search/generate-rpc.ts
-- Rebuild:   npx tsx scripts/build-search-rpcs.ts
--
-- Editing this file directly lets the manifest and the RPC drift, which is the
-- exact failure section 22 exists to prevent. Change the manifest or the
-- template instead; every RPC's diff will then show the change.
--
-- PIPELINE
--   candidates  one index-eligible UNION ALL branch per searchable field,
--               each emitting (root_id, source_type, source_id, matched_field)
--   matched_ids INTERSECT of candidates over all terms, on root_id -- so
--               section 24 holds structurally: every term must match the SAME
--               record, not merely appear somewhere in the result set
--   counted     exact total over ids alone, no joins (section 21)
--   page        order and slice the ids
--   display     join the paged ids back to the source tables
--   matches     provenance (section 6), aggregated for the paged ids only
--
-- !! RLS IS THE SOLE TENANT BOUNDARY IN THIS FUNCTION !!
--
-- There is no p_organization_id parameter and there must never be one, and no
-- explicit organization predicate in the branches. Both are deliberate: the
-- boundary is the row-level security policy on each table, which applies to a
-- SECURITY INVOKER function exactly as it does to a direct select.
--
--   If this function ever becomes SECURITY DEFINER, the explicit organization
--   predicate returns to EVERY branch in the SAME commit.
--
-- A SECURITY DEFINER function bypasses RLS, at which point the absent
-- predicate stops being redundant and becomes the only thing separating one
-- tenant from another's data. There is no intermediate state.
--
-- Same rule in docs/search-perf-decisions.md and in the header of the
-- hand-written search_scans migration.

CREATE OR REPLACE FUNCTION public.search_scans (
  p_query      text        DEFAULT NULL,
  p_scan_types text[]      DEFAULT NULL,
  p_since      timestamptz DEFAULT NULL,
  p_limit      integer     DEFAULT 50,
  p_offset     integer     DEFAULT 0
)
  RETURNS TABLE (
    id               uuid,
    asset_id         uuid,
    asset_name       text,
    asset_serial     text,
    scan_type        text,
    location_name    text,
    scanned_at       timestamptz,
    scanned_by_name  text,
    matches          jsonb,
    total_count      bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  AS $function$
  WITH
  -- Terms are folded and escaped ONCE here, not once per candidate row, and
  -- the complete LIKE pattern is built here too. MATERIALIZED stops the
  -- planner inlining the expression back into each branch, which is what made
  -- search_fold and search_escape_like run per row: 59.0ms against 39.9ms for
  -- a single branch.
  --
  -- No terms means no text filter, rather than matching nothing.
  terms AS MATERIALIZED (
    SELECT public.search_fold(t)                                       AS term,
           '%' || public.search_escape_like(public.search_fold(t)) || '%' AS pat
    FROM unnest(string_to_array(coalesce(btrim(p_query), ''), ' ')) AS t
    WHERE public.search_fold(t) <> ''
  ),

  -- One branch per searchable field, each a single-column predicate the
  -- planner can serve from that column's trigram index.
  candidates AS (
    -- public.assets.name
    SELECT t.term, s.id AS root_id, 'asset'::text AS source_type,
           a.id AS source_id, 'name'::text AS matched_field
    FROM terms t
    JOIN public.assets a
      ON public.search_fold(a.name)
         LIKE t.pat ESCAPE '\'
    JOIN public.scans s ON s.asset_id = a.id

    UNION ALL
    -- public.assets.serial_number
    SELECT t.term, s.id, 'asset', a.id, 'serial_number'
    FROM terms t
    JOIN public.assets a
      ON public.search_fold(a.serial_number)
         LIKE t.pat ESCAPE '\'
    JOIN public.scans s ON s.asset_id = a.id

    UNION ALL
    -- public.scans.location_name (root)
    SELECT t.term, s.id, 'scan', s.id, 'location_name'
    FROM terms t
    JOIN public.scans s
      ON public.search_fold(s.location_name)
         LIKE t.pat ESCAPE '\'

    UNION ALL
    -- public.users.first_name
    SELECT t.term, s.id, 'user', u.id, 'first_name'
    FROM terms t
    JOIN public.users u
      ON public.search_fold(u.first_name)
         LIKE t.pat ESCAPE '\'
    JOIN public.scans s ON s.scanned_by = u.id

    UNION ALL
    -- public.users.last_name
    SELECT t.term, s.id, 'user', u.id, 'last_name'
    FROM terms t
    JOIN public.users u
      ON public.search_fold(u.last_name)
         LIKE t.pat ESCAPE '\'
    JOIN public.scans s ON s.scanned_by = u.id
  ),

  -- Section 24, structurally: a record survives only if EVERY term found some
  -- field on it. Intersection is on root_id.
  matched_ids AS (
    SELECT c.root_id
    FROM candidates c
    GROUP BY c.root_id
    HAVING count(DISTINCT c.term) = (SELECT count(*) FROM terms)
  ),

  -- Structured filters apply to ids only -- still no joins to display data.
  filtered AS (
    SELECT s.id, s.scanned_at
    FROM public.scans s
    WHERE ((SELECT count(*) FROM terms) = 0
           OR s.id IN (SELECT m.root_id FROM matched_ids m))
      AND (p_scan_types IS NULL OR s.scan_type = ANY (p_scan_types))
      AND (p_since IS NULL OR s.scanned_at >= p_since)
  ),

  -- Exact total for THIS query, over ids (section 21). Never rows.length.
  counted AS (SELECT count(*)::bigint AS n FROM filtered),

  -- Order and slice BEFORE joining anything: the display joins below run
  -- against p_limit rows, not the table.
  page AS (
    SELECT f.id
    FROM filtered f
    ORDER BY f.scanned_at DESC, f.id DESC
    LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0))
  )

  SELECT
    s.id,
    s.asset_id,
    a.name::text,
    a.serial_number::text,
    s.scan_type::text,
    s.location_name::text,
    s.scanned_at,
    nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''),
    COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
               'source_type',   c.source_type,
               'source_id',     c.source_id,
               'matched_field', c.matched_field))
      FROM candidates c
      WHERE c.root_id = s.id
    ), '[]'::jsonb),
    (SELECT n FROM counted)
  FROM page p
  JOIN public.scans s ON s.id = p.id
  JOIN public.assets a ON a.id = s.asset_id
  LEFT JOIN public.users u ON u.id = s.scanned_by
  ORDER BY s.scanned_at DESC, s.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.search_scans(text, text[], timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_scans(text, text[], timestamptz, integer, integer) TO "authenticated", "service_role";

-- SQL functions default to procost 100, which is meant for something
-- expensive. These are a regexp and a few replaces; left at the default,
-- Postgres priced a 200k sequential scan at 31,967,185 and made visibly
-- distorted plan choices around it.
ALTER FUNCTION public.search_fold(text)        COST 1;
ALTER FUNCTION public.search_escape_like(text) COST 1;
