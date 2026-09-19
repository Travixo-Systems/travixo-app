-- search_assets: server-side search over public.assets.
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

CREATE OR REPLACE FUNCTION public.search_assets (
  p_query         text    DEFAULT NULL,
  p_statuses      text[]  DEFAULT NULL,
  p_category_id   uuid    DEFAULT NULL,
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
    archived_at      timestamptz,
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
    -- public.assets.name (root)
    SELECT t.term, a.id AS root_id, 'asset'::text AS source_type,
           a.id AS source_id, 'name'::text AS matched_field
    FROM terms t
    JOIN public.assets a
      ON public.search_fold(a.name)
         LIKE t.pat ESCAPE '\'

    UNION ALL
    -- public.assets.serial_number (root)
    SELECT t.term, a.id, 'asset', a.id, 'serial_number'
    FROM terms t
    JOIN public.assets a
      ON public.search_fold(a.serial_number)
         LIKE t.pat ESCAPE '\'

    UNION ALL
    -- public.assets.description (root)
    SELECT t.term, a.id, 'asset', a.id, 'description'
    FROM terms t
    JOIN public.assets a
      ON public.search_fold(a.description)
         LIKE t.pat ESCAPE '\'

    UNION ALL
    -- public.assets.current_location (root)
    SELECT t.term, a.id, 'asset', a.id, 'current_location'
    FROM terms t
    JOIN public.assets a
      ON public.search_fold(a.current_location)
         LIKE t.pat ESCAPE '\'

    UNION ALL
    -- public.assets.qr_code (root)
    SELECT t.term, a.id, 'asset', a.id, 'qr_code'
    FROM terms t
    JOIN public.assets a
      ON public.search_fold(a.qr_code)
         LIKE t.pat ESCAPE '\'

    UNION ALL
    -- public.asset_categories.name
    SELECT t.term, a.id, 'category', ac.id, 'name'
    FROM terms t
    JOIN public.asset_categories ac
      ON public.search_fold(ac.name)
         LIKE t.pat ESCAPE '\'
    JOIN public.assets a ON a.category_id = ac.id
  ),

  -- Section 24, structurally: a record survives only if EVERY term found some
  -- field on it. Intersection is on root_id.
  matched_ids AS (
    SELECT cand.root_id
    FROM candidates cand
    GROUP BY cand.root_id
    HAVING count(DISTINCT cand.term) = (SELECT count(*) FROM terms)
  ),

  -- Structured filters apply to ids only -- still no joins to display data.
  filtered AS (
    SELECT a.id, a.created_at
    FROM public.assets a
    WHERE ((SELECT count(*) FROM terms) = 0
           OR a.id IN (SELECT m.root_id FROM matched_ids m))
      AND (p_statuses IS NULL OR a.status = ANY (p_statuses))
      AND (p_category_id IS NULL OR a.category_id = p_category_id)
      AND (p_show_archived OR a.archived_at IS NULL)
  ),

  -- Exact total for THIS query, over ids (section 21). Never rows.length.
  counted AS (SELECT count(*)::bigint AS n FROM filtered),

  -- Order and slice BEFORE joining anything: the display joins below run
  -- against p_limit rows, not the table.
  page AS (
    SELECT f.id
    FROM filtered f
    ORDER BY f.created_at DESC, f.id DESC
    LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0))
  )

  SELECT
    a.id,
    a.name::text,
    a.serial_number::text,
    a.description::text,
    a.status::text,
    a.current_location::text,
    a.category_id,
    ac.name::text,
    a.qr_code::text,
    a.purchase_date,
    a.purchase_price,
    a.current_value,
    a.archived_at,
    COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
               'source_type',   prov.source_type,
               'source_id',     prov.source_id,
               'matched_field', prov.matched_field))
      FROM candidates prov
      WHERE prov.root_id = a.id
    ), '[]'::jsonb),
    (SELECT n FROM counted)
  FROM page p
  JOIN public.assets a ON a.id = p.id
  LEFT JOIN public.asset_categories ac ON ac.id = a.category_id
  ORDER BY a.created_at DESC, a.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.search_assets(text, text[], uuid, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_assets(text, text[], uuid, boolean, integer, integer) TO "authenticated", "service_role";

-- SQL functions default to procost 100, which is meant for something
-- expensive. These are a regexp and a few replaces; left at the default,
-- Postgres priced a 200k sequential scan at 31,967,185 and made visibly
-- distorted plan choices around it.
ALTER FUNCTION public.search_fold(text)        COST 1;
ALTER FUNCTION public.search_escape_like(text) COST 1;
