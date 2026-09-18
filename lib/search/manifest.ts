// lib/search/manifest.ts
//
// The field manifest required by the spec's section 22.
//
// The problem section 22 addresses is organisational, not technical: each page
// picked a few fields to search by hand, so a newly displayed value was
// searchable only if a developer remembered to extend a .filter() predicate.
// `false` must therefore be a decision somebody made, never the residue of an
// oversight -- which is why every entry below carries a `note` when it is not
// searchable.
//
// Section 23 sets the default: a business-meaningful text value shown to the
// user is a search candidate unless there is a documented reason otherwise.
//
// This file is declarative. It does not execute the search; it records what
// each surface promises, so a reviewer can diff intent against the RPC.

/** What a field is allowed to participate in on its surface. */
export interface FieldPolicy {
  /** Rendered to the user somewhere on this surface. */
  visible: boolean
  /** Reachable by the free-text query. */
  searchable: boolean
  /** Has its own structured filter control. */
  filterable: boolean
  /** Can order the server-side result set. */
  sortable: boolean
  /**
   * Required whenever a visible field is not searchable, and whenever the
   * treatment is unusual. Section 22 exists precisely so these choices are
   * written down rather than inferred from a predicate.
   */
  note?: string
  /**
   * How this field is reached in SQL. REQUIRED when `searchable` is true and
   * `resolvedClientSide` is not set: the generator emits one UNION branch per
   * searchable field, and a field it cannot bind is a build error rather than
   * a silently omitted branch.
   *
   * Omit for fields that are not text-searchable (dates, coordinates).
   */
  sql?: FieldBinding
  /**
   * Set when a field is reachable by what the user types, but NOT by matching
   * text against a column.
   *
   * The case this exists for: `scan_type` is stored as an English enum and
   * rendered as a translated label. Typing "sortie" must find checkouts, so
   * the field is searchable -- but the client resolves the label to enum
   * values against the active locale's dictionary and passes them as a
   * structured parameter. Text-matching either the enum or a label in SQL
   * would be wrong in one language or the other.
   *
   * Required, rather than just omitting `sql`, so that "searchable with no
   * branch" stays a build error for every field that has not explicitly
   * declared why.
   */
  resolvedClientSide?: string
}

/**
 * Where a searchable field physically lives, and how to get from that table
 * back to the surface's root record.
 *
 * `join` is null when the column is on the root table itself.
 */
export interface FieldBinding {
  /** Schema-qualified table holding the column, e.g. 'public.assets'. */
  table: string
  /** Alias used inside the generated branch. */
  alias: string
  /** The column to fold and match. */
  column: string
  /** Value for the provenance `source_type` column. */
  sourceType: string
  /** Value for the provenance `matched_field` column. */
  matchedField: string
  /**
   * How the matched row reaches the root table. Null when the column is on
   * the root table, in which case the branch selects the root directly.
   */
  join: { rootAlias: string; on: string } | null
}

/** A surface's root table and the id the pipeline intersects on. */
export interface SurfaceRoot {
  /** Generated function name, e.g. 'search_scans'. */
  fn: string
  /** Schema-qualified root table. */
  table: string
  /** Alias for the root table. */
  alias: string
  /** Column used for ORDER BY, newest first. */
  orderBy: string
}

export type SurfaceManifest = Record<string, FieldPolicy>

/**
 * Scans -- block 3, the pilot surface. Spec section 10.
 *
 * The old client-side predicate searched asset name, serial and location over
 * the 50 rows already loaded. Everything below is evaluated server-side
 * against the whole authorized dataset.
 */
export const scansRoot: SurfaceRoot = {
  fn: 'search_scans',
  table: 'public.scans',
  alias: 's',
  orderBy: 'scanned_at',
}

export const scansFields: SurfaceManifest = {
  assetName: {
    visible: true, searchable: true, filterable: false, sortable: true,
    sql: {
      table: 'public.assets', alias: 'a', column: 'name',
      sourceType: 'asset', matchedField: 'name',
      join: { rootAlias: 's', on: 's.asset_id = a.id' },
    },
  },
  assetSerialNumber: {
    visible: true, searchable: true, filterable: false, sortable: true,
    sql: {
      table: 'public.assets', alias: 'a', column: 'serial_number',
      sourceType: 'asset', matchedField: 'serial_number',
      join: { rootAlias: 's', on: 's.asset_id = a.id' },
    },
  },
  locationName: {
    visible: true, searchable: true, filterable: false, sortable: false,
    sql: {
      // On the root table itself, so no join.
      table: 'public.scans', alias: 's', column: 'location_name',
      sourceType: 'scan', matchedField: 'location_name',
      join: null,
    },
  },

  // Section 10 names "personne ayant scanné" explicitly. It was rendered but
  // not searchable, so "which scans did Jean do" had no answer. Two branches,
  // because the page renders "First Last" but the columns are separate.
  scannedByFirstName: {
    visible: true, searchable: true, filterable: false, sortable: false,
    sql: {
      table: 'public.users', alias: 'u', column: 'first_name',
      sourceType: 'user', matchedField: 'first_name',
      join: { rootAlias: 's', on: 's.scanned_by = u.id' },
    },
  },
  scannedByLastName: {
    visible: true, searchable: true, filterable: false, sortable: false,
    sql: {
      table: 'public.users', alias: 'u', column: 'last_name',
      sourceType: 'user', matchedField: 'last_name',
      join: { rootAlias: 's', on: 's.scanned_by = u.id' },
    },
  },

  // Resolved client-side from the active locale's label dictionary into enum
  // values, then filtered on the enum server-side. Never text-matched: the
  // stored value is an English enum (check/inventory/checkout/return) while
  // the user sees a translated label, so an ILIKE against either would be
  // wrong in one language. searchable AND filterable, by explicit decision --
  // typing "sortie" must find checkouts.
  scanType: {
    visible: true,
    searchable: true,
    filterable: true,
    sortable: false,
    note: 'Label resolved to enum values client-side; the RPC filters on the enum, never on a label. A term resolving to zero enums stays a text term rather than being dropped.',
    resolvedClientSide:
      'Stored as an English enum (check/inventory/checkout/return), rendered as a translated label. The client maps the typed term to enum values against the active locale dictionary and passes them as p_scan_types. An ILIKE against either the enum or a label would be wrong in one language.',
  },

  scannedAt: {
    visible: true,
    searchable: false,
    filterable: true,
    sortable: true,
    note: 'Date, not text. Reachable through the range filter; free-text date parsing is deliberately out of scope.',
  },

  notes: {
    visible: false,
    searchable: false,
    filterable: false,
    sortable: false,
    note: 'Column exists on scans but is not rendered on this surface. Not searchable while invisible, per section 23 -- revisit if it is ever displayed.',
  },

  latitude: {
    visible: false, searchable: false, filterable: false, sortable: false,
    note: 'Coordinate, no retrieval value as text.',
  },
  longitude: {
    visible: false, searchable: false, filterable: false, sortable: false,
    note: 'Coordinate, no retrieval value as text.',
  },
}

/**
 * Normalisation variants in use across the codebase.
 *
 * Recorded here, and not only in a comment at the call site, because section
 * 22 is the mechanism that is supposed to stop silent divergence coming back.
 * A second fold implementation appearing in a page is exactly the drift the
 * manifest exists to catch, so the legitimate exceptions have to be listed
 * somewhere a reviewer looks.
 */
export const normalisationVariants = [
  {
    fn: 'foldSearchValue',
    module: 'lib/search/fold.ts',
    behaviour: "NFD decompose, strip combining marks, lowercase, trim.",
    usedBy: 'Every search surface, client-side. Mirrored in SQL by public.search_fold().',
    note: 'The canonical fold. Parity with SQL is enforced by scripts/verify/verify-search-fold-parity.mjs.',
  },
  {
    fn: 'norm',
    module: 'lib/import/categoryInference.ts',
    behaviour: 'foldSearchValue, PLUS collapse internal whitespace to one space.',
    usedBy: 'Spreadsheet import: matching sheet category names onto existing asset_categories rows.',
    note: 'DELIBERATE SUPERSET, not a duplicate. A cell reading "Chariot   elevateur" must map onto the existing "Chariot elevateur" category. Search must NOT collapse internal whitespace -- it splits the query into terms and ANDs them instead (section 24), so collapsing would change matching semantics. Do not "simplify" this into foldSearchValue.',
  },
  {
    fn: 'norm',
    module: 'scripts/backfill-rental-client-ids.mjs',
    behaviour: 'Same as the categoryInference variant.',
    usedBy: 'One-shot backfill script linking rentals to clients by name.',
    note: 'Local copy on purpose: a standalone .mjs run by plain node, with no bundler and no "@/" path alias, so lib/search/ is unreachable. Not a search path. If this ever joins the app build, switch it to the kernel.',
  },
] as const
