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
   * CLOSED SET. The reason must be one of `ResolvedClientSideReason`, and each
   * entry must carry a written justification. This is deliberately awkward:
   * `resolvedClientSide` is the ONLY route by which a field can be
   * `searchable: true` and still emit no SQL branch, so it is exactly the
   * route by which a field could quietly stop being searchable. Every use is
   * listed in `resolvedClientSideRegister` below and is reviewed whenever the
   * manifest is reviewed.
   *
   * The case this exists for: `scan_type` is stored as an English enum and
   * rendered as a translated label. Typing "sortie" must find checkouts, so
   * the field is searchable -- but the client resolves the label to enum
   * values against the active locale's dictionary and passes them as a
   * structured parameter. Text-matching either the enum or a label in SQL
   * would be wrong in one language or the other.
   */
  resolvedClientSide?: {
    reason: ResolvedClientSideReason
    /** Why this field cannot be a SQL text branch. Required, not optional. */
    justification: string
    /** The RPC parameter the resolved values are passed through. */
    parameter: string
  }
}

/**
 * The closed set of reasons a searchable field may emit no SQL branch.
 *
 * Adding a member is a deliberate act that shows up in review. It is not a
 * free-text field precisely so that "we could not make it work" cannot become
 * a reason.
 */
export type ResolvedClientSideReason =
  /**
   * The stored value is a code and the user sees a localised label, so no
   * single SQL text predicate is correct in every locale. The client maps
   * label -> code against the active dictionary and sends codes.
   */
  | 'localised-enum'

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
    resolvedClientSide: {
      reason: 'localised-enum',
      justification:
        'Stored as an English enum (check/inventory/checkout/return), rendered as a translated label ("Sortie", "Retour", ...). The client maps the typed term to enum values against the active locale dictionary. An ILIKE against the stored enum fails for a French user; an ILIKE against a label fails for an English one; and a label table in the database would duplicate the i18n dictionary and make adding a locale a migration.',
      parameter: 'p_scan_types',
    },
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

/**
 * Clients -- block 5. Spec section 11.
 *
 * All five fields section 11 lists. `company` was already searched before this
 * refactor, so omitting it would have been a silent removal of working
 * behaviour; `email` and `phone` are the two the audit found rendered on the
 * card but unsearchable; `notes` is the first long free-text field in any
 * surface, which has consequences for provenance noise and selectivity --
 * measured and recorded in docs/search-clients-block5.md.
 */
export const clientsRoot: SurfaceRoot = {
  fn: 'search_clients',
  table: 'public.clients',
  alias: 'c',
  orderBy: 'created_at',
}

export const clientsFields: SurfaceManifest = {
  name: {
    visible: true, searchable: true, filterable: false, sortable: true,
    sql: {
      table: 'public.clients', alias: 'c', column: 'name',
      sourceType: 'client', matchedField: 'name',
      join: null,
    },
  },
  company: {
    visible: true, searchable: true, filterable: false, sortable: true,
    sql: {
      table: 'public.clients', alias: 'c', column: 'company',
      sourceType: 'client', matchedField: 'company',
      join: null,
    },
  },
  // Rendered on the client card and in the checkout selector rows, but not
  // searchable before this block -- so "find the client who emailed me" had no
  // answer. Section 11 names both explicitly.
  email: {
    visible: true, searchable: true, filterable: false, sortable: false,
    sql: {
      table: 'public.clients', alias: 'c', column: 'email',
      sourceType: 'client', matchedField: 'email',
      join: null,
    },
  },
  phone: {
    visible: true, searchable: true, filterable: false, sortable: false,
    sql: {
      table: 'public.clients', alias: 'c', column: 'phone',
      sourceType: 'client', matchedField: 'phone',
      join: null,
    },
  },
  notes: {
    visible: true, searchable: true, filterable: false, sortable: false,
    note: 'Long free text. Least selective branch on this surface and the noisiest in provenance -- a common word can match notes on many clients. Kept searchable because section 11 names it and it is rendered on the card, but it is the first candidate to reconsider if provenance becomes unreadable.',
    sql: {
      table: 'public.clients', alias: 'c', column: 'notes',
      sourceType: 'client', matchedField: 'notes',
      join: null,
    },
  },

  address: {
    visible: false,
    searchable: false,
    filterable: false,
    sortable: false,
    note: 'Column exists but is not selected or rendered by any clients surface, and section 11 does not list it. Not searchable while invisible, per section 23 -- revisit if it is ever displayed.',
  },

  createdAt: {
    visible: true,
    searchable: false,
    filterable: false,
    sortable: true,
    note: 'Date, not text. Orders the list; free-text date parsing is deliberately out of scope.',
  },
}

/**
 * Register of every field that is `searchable: true` but emits no SQL branch.
 *
 * WHY THIS LIST EXISTS SEPARATELY FROM THE FIELD ENTRIES
 *
 * `resolvedClientSide` is the only escape hatch from the generator's build
 * error, so it is the only quiet route by which a field could stop being
 * searchable -- set it, and the field emits nothing while still claiming to be
 * searchable. Collecting every use in one short list means "is this still
 * justified?" gets asked at manifest review, rather than discovered later by a
 * user who cannot find their equipment.
 *
 * Adding a field with `resolvedClientSide` and NOT listing it here fails
 * `npm run verify:search-rpcs`.
 *
 * Each entry must state what breaks if the escape hatch is removed.
 */
export const resolvedClientSideRegister = [
  {
    surface: 'scans',
    field: 'scanType',
    reason: 'localised-enum' as const,
    parameter: 'p_scan_types',
    ifRemoved:
      'Typing "sortie" would match nothing: an ILIKE on the stored English enum cannot match a French label. Making it a SQL branch would require either a label table duplicating the i18n dictionary -- which makes adding a locale a migration -- or accepting that search works in one language only.',
    reviewed: '2026-09-18',
  },
] as const
