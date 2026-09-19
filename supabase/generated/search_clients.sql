-- search_clients: server-side search over public.clients.
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

CREATE OR REPLACE FUNCTION public.search_clients (
  p_query  text    DEFAULT NULL,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
  RETURNS TABLE (
    id               uuid,
    name             text,
    company          text,
    email            text,
    phone            text,
    notes            text,
    created_at       timestamptz,
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
    -- public.clients.name (root)
    SELECT t.term, c.id AS root_id, 'client'::text AS source_type,
           c.id AS source_id, 'name'::text AS matched_field
    FROM terms t
    JOIN public.clients c
      ON public.search_fold(c.name)
         LIKE t.pat ESCAPE '\'

    UNION ALL
    -- public.clients.company (root)
    SELECT t.term, c.id, 'client', c.id, 'company'
    FROM terms t
    JOIN public.clients c
      ON public.search_fold(c.company)
         LIKE t.pat ESCAPE '\'

    UNION ALL
    -- public.clients.email (root)
    SELECT t.term, c.id, 'client', c.id, 'email'
    FROM terms t
    JOIN public.clients c
      ON public.search_fold(c.email)
         LIKE t.pat ESCAPE '\'

    UNION ALL
    -- public.clients.phone (root)
    SELECT t.term, c.id, 'client', c.id, 'phone'
    FROM terms t
    JOIN public.clients c
      ON public.search_fold(c.phone)
         LIKE t.pat ESCAPE '\'

    UNION ALL
    -- public.clients.notes (root)
    SELECT t.term, c.id, 'client', c.id, 'notes'
    FROM terms t
    JOIN public.clients c
      ON public.search_fold(c.notes)
         LIKE t.pat ESCAPE '\'
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
    SELECT c.id, c.created_at
    FROM public.clients c
    WHERE ((SELECT count(*) FROM terms) = 0
           OR c.id IN (SELECT m.root_id FROM matched_ids m))

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
    c.id,
    c.name::text,
    c.company::text,
    c.email::text,
    c.phone::text,
    c.notes::text,
    c.created_at,
    COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
               'source_type',   prov.source_type,
               'source_id',     prov.source_id,
               'matched_field', prov.matched_field))
      FROM candidates prov
      WHERE prov.root_id = c.id
    ), '[]'::jsonb),
    (SELECT n FROM counted)
  FROM page p
  JOIN public.clients c ON c.id = p.id
  ORDER BY c.created_at DESC, c.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.search_clients(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_clients(text, integer, integer) TO "authenticated", "service_role";

-- SQL functions default to procost 100, which is meant for something
-- expensive. These are a regexp and a few replaces; left at the default,
-- Postgres priced a 200k sequential scan at 31,967,185 and made visibly
-- distorted plan choices around it.
ALTER FUNCTION public.search_fold(text)        COST 1;
ALTER FUNCTION public.search_escape_like(text) COST 1;
