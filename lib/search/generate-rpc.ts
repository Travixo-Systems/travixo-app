// lib/search/generate-rpc.ts
//
// Generates a search RPC per surface from the field manifest.
//
// WHY THIS EXISTS
//
// The candidate branches are repetitive by construction -- one UNION ALL arm
// per searchable field, each identical but for a table, a column and two
// provenance literals. Scans has five and was tractable by hand. Fleet's
// section 5 contract reaches inspections, schedules, rentals, clients, scans
// and audits; written by hand across eight RPCs, the branches will drift from
// the manifest, which is precisely the failure section 22 exists to prevent.
//
// So the manifest is the source of truth and this file owns everything that
// is NOT per-surface:
//
//   * the tenant predicate (there is none: RLS, see the rule below)
//   * the provenance columns (source_type, source_id, matched_field)
//   * the pipeline shape: per-field UNION ALL -> INTERSECT on root_id per term
//     -> count over ids -> page ids -> join back -> aggregate matches for the
//     paged ids only
//   * SECURITY INVOKER
//   * COST 1 on the kernel calls
//
// A surface contributes only its root table and its field bindings. If a
// template change is needed, it happens here once and every RPC's diff shows
// it -- which is the reviewable-diff property the golden file exists to give.

import type { FieldBinding, SurfaceManifest, SurfaceRoot } from './manifest'

/** Thrown for a manifest a surface cannot be generated from. */
export class ManifestError extends Error {}

/**
 * Fields the generator must emit a branch for, validated.
 *
 * A field marked `searchable: true` with no `sql` binding is a BUILD ERROR,
 * not a silently skipped branch. Silently skipping is exactly how a field
 * becomes visible-but-unsearchable again, which is the drift section 23
 * forbids.
 */
export function searchableBindings(
  surface: string,
  fields: SurfaceManifest
): Array<{ key: string; sql: FieldBinding }> {
  const out: Array<{ key: string; sql: FieldBinding }> = []
  const unbound: string[] = []

  for (const [key, policy] of Object.entries(fields)) {
    if (!policy.searchable) continue
    // Reachable by what the user types, but not by matching text against a
    // column -- scan_type's label-to-enum resolution is the case. Declaring it
    // is mandatory, so that "searchable with no branch" stays an error for
    // every field that has not said why.
    if (policy.resolvedClientSide) continue
    if (!policy.sql) {
      unbound.push(key)
      continue
    }
    out.push({ key, sql: policy.sql })
  }

  if (unbound.length > 0) {
    throw new ManifestError(
      `${surface}: field(s) marked searchable with no sql binding: ` +
        `${unbound.join(', ')}. Add a binding, or set searchable: false with a ` +
        `note saying why. A searchable field with no branch would silently ` +
        `never match.`
    )
  }

  if (out.length === 0) {
    throw new ManifestError(
      `${surface}: no searchable fields. A search RPC with no branches would ` +
        `return nothing for every query.`
    )
  }

  return out
}

/** One UNION ALL arm: a single field, independently index-eligible. */
function branch(root: SurfaceRoot, b: FieldBinding, first: boolean): string {
  const lead = first ? '    ' : '    UNION ALL\n    '
  const cols = first
    ? `t.term, ${root.alias}.id AS root_id, '${b.sourceType}'::text AS source_type,\n           ${b.alias}.id AS source_id, '${b.matchedField}'::text AS matched_field`
    : `t.term, ${root.alias}.id, '${b.sourceType}', ${b.alias}.id, '${b.matchedField}'`

  const match =
    `public.search_fold(${b.alias}.${b.column})\n` +
    `         LIKE '%' || public.search_escape_like(t.term) || '%' ESCAPE '\\'`

  if (b.join === null) {
    // Column lives on the root table: match it directly, no join.
    return (
      `${lead}-- ${b.table}.${b.column} (root)\n` +
      `    SELECT ${cols}\n` +
      `    FROM terms t\n` +
      `    JOIN ${b.table} ${b.alias}\n` +
      `      ON ${match}\n`
    )
  }

  return (
    `${lead}-- ${b.table}.${b.column}\n` +
    `    SELECT ${cols}\n` +
    `    FROM terms t\n` +
    `    JOIN ${b.table} ${b.alias}\n` +
    `      ON ${match}\n` +
    `    JOIN ${root.table} ${root.alias} ON ${b.join.on}\n`
  )
}

export interface GenerateOptions {
  /** Extra RETURNS TABLE columns and their SELECT expressions, in order. */
  displayColumns: Array<{ name: string; type: string; expr: string }>
  /** Joins needed by the display SELECT, after paging. */
  displayJoins: string[]
  /** Optional structured filters, injected into the `filtered` CTE. */
  extraFilters?: Array<{ param: string; type: string; predicate: string }>
}

/**
 * Emit the full migration SQL for one surface.
 *
 * Deterministic: same manifest in, byte-identical SQL out. That is what makes
 * the golden-file test meaningful.
 */
export function generateSearchRpc(
  root: SurfaceRoot,
  fields: SurfaceManifest,
  opts: GenerateOptions
): string {
  const bindings = searchableBindings(root.fn, fields)

  const params = [
    ['p_query', 'text', 'NULL'],
    ...(opts.extraFilters ?? []).map((f) => [f.param, f.type, 'NULL']),
    ['p_limit', 'integer', '50'],
    ['p_offset', 'integer', '0'],
  ]
  const paramWidth = Math.max(...params.map((p) => p[0].length))
  const typeWidth = Math.max(...params.map((p) => p[1].length))
  const paramSql = params
    .map(
      ([n, t, d]) =>
        `  ${n.padEnd(paramWidth)} ${t.padEnd(typeWidth)} DEFAULT ${d}`
    )
    .join(',\n')

  const signature = params.map((p) => p[1]).join(', ')

  const returnCols = [
    ...opts.displayColumns.map((c) => `    ${c.name.padEnd(16)} ${c.type}`),
    `    ${'matches'.padEnd(16)} jsonb`,
    `    ${'total_count'.padEnd(16)} bigint`,
  ].join(',\n')

  const branches = bindings
    .map((b, i) => branch(root, b.sql, i === 0))
    .join('\n')

  const filterClauses = (opts.extraFilters ?? [])
    .map((f) => `      AND (${f.param} IS NULL OR ${f.predicate})`)
    .join('\n')

  const selectExprs = opts.displayColumns.map((c) => `    ${c.expr}`).join(',\n')

  return `-- ${root.fn}: server-side search over ${root.table}.
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

CREATE OR REPLACE FUNCTION public.${root.fn} (
${paramSql}
)
  RETURNS TABLE (
${returnCols}
  )
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  AS $function$
  WITH
  -- Terms are folded once here, not once per row. No terms means no text
  -- filter, rather than matching nothing.
  terms AS (
    SELECT public.search_fold(t) AS term
    FROM unnest(string_to_array(coalesce(btrim(p_query), ''), ' ')) AS t
    WHERE public.search_fold(t) <> ''
  ),

  -- One branch per searchable field, each a single-column predicate the
  -- planner can serve from that column's trigram index.
  candidates AS (
${branches}  ),

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
    SELECT ${root.alias}.id, ${root.alias}.${root.orderBy}
    FROM ${root.table} ${root.alias}
    WHERE ((SELECT count(*) FROM terms) = 0
           OR ${root.alias}.id IN (SELECT m.root_id FROM matched_ids m))
${filterClauses}
  ),

  -- Exact total for THIS query, over ids (section 21). Never rows.length.
  counted AS (SELECT count(*)::bigint AS n FROM filtered),

  -- Order and slice BEFORE joining anything: the display joins below run
  -- against p_limit rows, not the table.
  page AS (
    SELECT f.id
    FROM filtered f
    ORDER BY f.${root.orderBy} DESC, f.id DESC
    LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0))
  )

  SELECT
${selectExprs},
    COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
               'source_type',   c.source_type,
               'source_id',     c.source_id,
               'matched_field', c.matched_field))
      FROM candidates c
      WHERE c.root_id = ${root.alias}.id
    ), '[]'::jsonb),
    (SELECT n FROM counted)
  FROM page p
  JOIN ${root.table} ${root.alias} ON ${root.alias}.id = p.id
${opts.displayJoins.map((j) => `  ${j}`).join('\n')}
  ORDER BY ${root.alias}.${root.orderBy} DESC, ${root.alias}.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.${root.fn}(${signature}) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.${root.fn}(${signature}) TO "authenticated", "service_role";

-- SQL functions default to procost 100, which is meant for something
-- expensive. These are a regexp and a few replaces; left at the default,
-- Postgres priced a 200k sequential scan at 31,967,185 and made visibly
-- distorted plan choices around it.
ALTER FUNCTION public.search_fold(text)        COST 1;
ALTER FUNCTION public.search_escape_like(text) COST 1;
`
}
