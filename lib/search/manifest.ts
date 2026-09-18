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
}

export type SurfaceManifest = Record<string, FieldPolicy>

/**
 * Scans -- block 3, the pilot surface. Spec section 10.
 *
 * The old client-side predicate searched asset name, serial and location over
 * the 50 rows already loaded. Everything below is evaluated server-side
 * against the whole authorized dataset.
 */
export const scansFields: SurfaceManifest = {
  assetName: { visible: true, searchable: true, filterable: false, sortable: true },
  assetSerialNumber: { visible: true, searchable: true, filterable: false, sortable: true },
  locationName: { visible: true, searchable: true, filterable: false, sortable: false },

  // Section 10 names "personne ayant scanné" explicitly. It was rendered but
  // not searchable, so "which scans did Jean do" had no answer.
  scannedByName: { visible: true, searchable: true, filterable: false, sortable: false },

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
