-- search_scans: server-side search over every scan the caller may see.
--
-- Block 3 of the search refactor, the pilot surface. Spec sections 2, 10, 20,
-- 21, 24, 27.
--
-- Replaces a client-side filter over the 50 rows already loaded, which also
-- hid "Load more" while a search was active, so older matches were
-- unreachable without clearing the box first.
--
-- ---------------------------------------------------------------------------
-- SHAPE
-- ---------------------------------------------------------------------------
-- The obvious formulation -- one predicate OR-ing five columns across three
-- tables -- cannot be indexed. A row may qualify through any column, so no
-- index can restrict the driving table, and the planner reads every scan and
-- joins it before filtering. Measured at 200k scans: 10 seconds, 3.4M buffer
-- hits, trigram indexes never touched.
--
-- So the pipeline is:
--
--   candidates(T) = UNION ALL of one branch per searchable field, each branch
--                   independently index-eligible on search_fold(col) and
--                   emitting (root_id, source_type, source_id, matched_field)
--   result_ids    = INTERSECT of candidates(T) over all terms, on root_id
--   total_count   = count over result_ids            -- ids only, no joins
--   page          = order + limit/offset on result_ids
--   display       = join the paged ids back to the source tables
--   matches       = aggregate candidates for those ids
--
-- Two consequences worth stating. The INTERSECT satisfies section 24
-- structurally rather than by a filter someone has to remember: every term
-- must hit the SAME root record, because intersection is on root_id. And the
-- joins happen after pagination, against 50 ids, instead of against the whole
-- table before it.
--
-- SUPERSEDED BY THE GENERATOR.
--
-- This file is the hand-written original, kept as the migration of record
-- because it is what shipped. The generator now reproduces it from the field
-- manifest: `npx tsx scripts/build-search-rpcs.ts` writes
-- supabase/generated/search_scans.sql, which was diffed against this body and
-- verified to differ only in comment wording, comment placement, one
-- whitespace alignment, and the order of the three WHERE clauses in `filtered`
-- (all AND-ed, so semantically identical). The generated version passes the
-- full block 3 spec suite, including the tenant test.
--
-- DO NOT hand-edit this function. Change lib/search/manifest.ts or the
-- template in lib/search/generate-rpc.ts, regenerate, and commit the new
-- migration. Editing here lets the manifest and the SQL that actually runs
-- drift, which is the exact failure section 22 exists to prevent.
--
-- ---------------------------------------------------------------------------
-- TENANCY
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER, deliberately. There is no p_organization_id parameter and
-- there must never be one: the boundary is the scans_select_same_org policy,
-- which scopes through assets.organization_id. Running as the invoker means
-- that policy applies here exactly as it does to a direct select.
--
-- Every branch that reaches a related table carries the same boundary as the
-- root: the joins to assets and users are subject to their own RLS, and the
-- assets join is INNER precisely because the scans policy reaches the tenant
-- through it. A LEFT JOIN there would be a tenant hole.
--
-- !! RLS IS THE SOLE TENANT BOUNDARY IN THIS FUNCTION !!
--
-- The explicit EXISTS guards on assets were removed from every branch: they
-- were verified redundant under RLS (identical row counts with and without)
-- and cost ~30ms by forcing a sequential scan ahead of the trigram predicate.
-- That is sound ONLY while this function is SECURITY INVOKER.
--
--   If this function ever becomes SECURITY DEFINER, the explicit organization
--   predicate returns to EVERY branch in the SAME commit.
--
-- A SECURITY DEFINER function bypasses RLS, at which point those guards stop
-- being redundant and become the only thing separating one tenant from
-- another's data. There is no intermediate state where this is DEFINER and
-- the branches carry no org predicate.
--
-- Same rule in docs/search-perf-decisions.md and in the branch template in
-- lib/search/generate-rpc.ts.

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
  -- Terms are folded once here, not once per row. A NULL or blank query
  -- yields zero terms, which means "no text filter" rather than "match
  -- nothing" -- see the coalesce on matched_ids below.
  terms AS (
    SELECT public.search_fold(t) AS term
    FROM unnest(string_to_array(coalesce(btrim(p_query), ''), ' ')) AS t
    WHERE public.search_fold(t) <> ''
  ),

  -- One branch per searchable field. Each is a separate, index-eligible
  -- predicate over a single column, so the planner can use the trigram index
  -- built on that exact expression.
  candidates AS (
    -- asset.name
    SELECT t.term, s.id AS root_id, 'asset'::text AS source_type,
           a.id AS source_id, 'name'::text AS matched_field
    FROM terms t
    JOIN public.assets a
      ON public.search_fold(a.name)
         LIKE '%' || public.search_escape_like(t.term) || '%' ESCAPE '\'
    JOIN public.scans s ON s.asset_id = a.id

    UNION ALL
    -- asset.serial_number
    SELECT t.term, s.id, 'asset', a.id, 'serial_number'
    FROM terms t
    JOIN public.assets a
      ON public.search_fold(a.serial_number)
         LIKE '%' || public.search_escape_like(t.term) || '%' ESCAPE '\'
    JOIN public.scans s ON s.asset_id = a.id

    UNION ALL
    -- scan.location_name
    --
    -- No EXISTS guard on assets here, deliberately. The scans_select_same_org
    -- policy ALREADY restricts this table through assets.organization_id, so
    -- an explicit guard adds nothing to safety (verified: identical row counts
    -- with and without it) while costing a great deal. Applying it forced the
    -- planner to seq-scan all 200k scans and demote the trigram predicate to a
    -- Join Filter -- 963ms in a branch that returned zero rows.
    SELECT t.term, s.id, 'scan', s.id, 'location_name'
    FROM terms t
    JOIN public.scans s
      ON public.search_fold(s.location_name)
         LIKE '%' || public.search_escape_like(t.term) || '%' ESCAPE '\'

    UNION ALL
    -- user.first_name
    SELECT t.term, s.id, 'user', u.id, 'first_name'
    FROM terms t
    JOIN public.users u
      ON public.search_fold(u.first_name)
         LIKE '%' || public.search_escape_like(t.term) || '%' ESCAPE '\'
    JOIN public.scans s ON s.scanned_by = u.id

    UNION ALL
    -- user.last_name
    SELECT t.term, s.id, 'user', u.id, 'last_name'
    FROM terms t
    JOIN public.users u
      ON public.search_fold(u.last_name)
         LIKE '%' || public.search_escape_like(t.term) || '%' ESCAPE '\'
    JOIN public.scans s ON s.scanned_by = u.id
  ),

  -- Section 24, structurally: a scan survives only if EVERY term found some
  -- field on it. Intersection is on root_id, so one term cannot be satisfied
  -- by an unrelated record.
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
    WHERE (p_since IS NULL OR s.scanned_at >= p_since)
      -- The client resolves a typed label ("sortie") to enum values against
      -- the active locale's dictionary and passes them here. This never
      -- text-matches a label: the stored value is an English enum while the
      -- user sees a translated string.
      AND (p_scan_types IS NULL OR s.scan_type = ANY (p_scan_types))
      -- No terms means no text filter, so every visible scan is eligible.
      AND ((SELECT count(*) FROM terms) = 0
           OR s.id IN (SELECT m.root_id FROM matched_ids m))
  ),

  -- The exact total for THIS query, over ids alone (section 21). Never
  -- rows.length, which is the page size rather than the result size.
  counted AS (SELECT count(*)::bigint AS n FROM filtered),

  -- Order and slice BEFORE joining anything. This is the whole point: the
  -- display joins below run against p_limit rows, not the table.
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
    -- Provenance (section 6): why this row matched, so a relational hit is
    -- explainable rather than arbitrary. Aggregated for the paged ids only.
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
  JOIN public.scans s  ON s.id = p.id
  JOIN public.assets a ON a.id = s.asset_id
  LEFT JOIN public.users u ON u.id = s.scanned_by
  ORDER BY s.scanned_at DESC, s.id DESC;
$function$;

COMMENT ON FUNCTION public.search_scans(text, text[], timestamptz, integer, integer) IS
  'One page of scans matching a folded multi-term query across asset name and serial, scan location, and the scanning user, plus optional scan_type and date filters. Candidates are gathered per field as index-eligible UNION branches and intersected per term on scan id, so every term must match the same scan. Pagination precedes the display joins. SECURITY INVOKER: tenant scope comes from the scans/assets RLS policies, never from a parameter. total_count is the exact match count for the same query. Generated from lib/search/manifest.ts -- regenerate rather than hand-edit.';

REVOKE ALL ON FUNCTION public.search_scans(text, text[], timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_scans(text, text[], timestamptz, integer, integer) TO "authenticated", "service_role";

-- Serves the ORDER BY so an unfiltered page does not sort the whole table,
-- and the id lookups in the filtered CTE. The trigram indexes from the kernel
-- migration serve the per-field candidate branches.
CREATE INDEX IF NOT EXISTS idx_scans_scanned_at_id_desc
  ON public.scans (scanned_at DESC, id DESC);

-- The candidate branches join scans by scanned_by; without this the user
-- branches fall back to a sequential scan of scans.
CREATE INDEX IF NOT EXISTS idx_scans_scanned_by
  ON public.scans (scanned_by);

-- SQL functions default to procost 100, which is meant for something
-- expensive. These are a regexp and a few replaces. Left at the default,
-- Postgres costed a sequential scan of 200k scans at 31,967,185 and made
-- visibly distorted plan choices around it. They are cheap; say so.
ALTER FUNCTION public.search_fold(text)        COST 1;
ALTER FUNCTION public.search_escape_like(text) COST 1;
