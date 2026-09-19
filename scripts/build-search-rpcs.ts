// Regenerate the search RPCs from the field manifest.
//
//   npx tsx scripts/build-search-rpcs.ts           # write
//   npx tsx scripts/build-search-rpcs.ts --check   # verify, exit 1 on drift
//
// --check is the golden-file test: it regenerates into memory and compares
// against what is committed. A template change then surfaces as a reviewable
// diff rather than as a silent difference between the manifest and the SQL
// that actually runs.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { generateSearchRpc, ManifestError } from '../lib/search/generate-rpc'
import {
  assetsFields,
  assetsHistoryFields,
  assetsHistoryRoot,
  assetsRoot,
  clientsFields,
  clientsRoot,
  scansFields,
  scansRoot,
} from '../lib/search/manifest'

interface Target {
  out: string
  sql: string
}

/**
 * Shared by both Fleet surfaces.
 *
 * The instant and history paths return the SAME row shape deliberately: the
 * page renders one list, and a history result has to sit beside an instant one
 * without the caller reshaping it. Only the branches differ.
 */
const ASSET_DISPLAY_COLUMNS = [
  { name: 'id', type: 'uuid', expr: 'a.id' },
  { name: 'name', type: 'text', expr: 'a.name::text' },
  { name: 'serial_number', type: 'text', expr: 'a.serial_number::text' },
  { name: 'description', type: 'text', expr: 'a.description::text' },
  { name: 'status', type: 'text', expr: 'a.status::text' },
  { name: 'current_location', type: 'text', expr: 'a.current_location::text' },
  { name: 'category_id', type: 'uuid', expr: 'a.category_id' },
  { name: 'category_name', type: 'text', expr: 'ac.name::text' },
  { name: 'qr_code', type: 'text', expr: 'a.qr_code::text' },
  { name: 'purchase_date', type: 'date', expr: 'a.purchase_date' },
  { name: 'purchase_price', type: 'numeric', expr: 'a.purchase_price' },
  { name: 'current_value', type: 'numeric', expr: 'a.current_value' },
  { name: 'archived_at', type: 'timestamptz', expr: 'a.archived_at' },
]

// LEFT: category_id is nullable with ON DELETE SET NULL, so an uncategorised
// asset must still appear.
const ASSET_DISPLAY_JOINS = [
  'LEFT JOIN public.asset_categories ac ON ac.id = a.category_id',
]

const ASSET_FILTERS = [
  {
    param: 'p_statuses',
    type: 'text[]',
    // Resolved client-side from the locale's labels, exactly as scan_type is.
    predicate: 'a.status = ANY (p_statuses)',
  },
  {
    param: 'p_category_id',
    type: 'uuid',
    predicate: 'a.category_id = p_category_id',
  },
  {
    param: 'p_show_archived',
    type: 'boolean',
    // Always applied: archived assets are hidden unless explicitly asked for,
    // so there is no null state meaning "no filter".
    default: 'false',
    predicate: 'p_show_archived OR a.archived_at IS NULL',
  },
]

function build(): Target[] {
  return [
    {
      out: 'supabase/generated/search_scans.sql',
      sql: generateSearchRpc(scansRoot, scansFields, {
        displayColumns: [
          { name: 'id', type: 'uuid', expr: 's.id' },
          { name: 'asset_id', type: 'uuid', expr: 's.asset_id' },
          { name: 'asset_name', type: 'text', expr: 'a.name::text' },
          { name: 'asset_serial', type: 'text', expr: 'a.serial_number::text' },
          { name: 'scan_type', type: 'text', expr: 's.scan_type::text' },
          { name: 'location_name', type: 'text', expr: 's.location_name::text' },
          { name: 'scanned_at', type: 'timestamptz', expr: 's.scanned_at' },
          {
            name: 'scanned_by_name',
            type: 'text',
            // Rendered as "First Last"; searched as the same string so a full
            // name typed in one go matches. Both parts are nullable and
            // scanned_by is ON DELETE SET NULL, hence the trimmed concat.
            expr: "nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), '')",
          },
        ],
        displayJoins: [
          // INNER, deliberately: the scans policy reaches the tenant THROUGH
          // assets, so a scan whose asset is invisible is not the caller's to
          // see. A LEFT JOIN here would be a tenant hole.
          'JOIN public.assets a ON a.id = s.asset_id',
          // LEFT: a scan may be anonymous, or its user deleted.
          'LEFT JOIN public.users u ON u.id = s.scanned_by',
        ],
        extraFilters: [
          {
            param: 'p_scan_types',
            type: 'text[]',
            // Structured filter on the enum. The client resolves a typed
            // label ("sortie") to enum values against the active locale's
            // dictionary; this never text-matches a label.
            predicate: 's.scan_type = ANY (p_scan_types)',
          },
          {
            param: 'p_since',
            type: 'timestamptz',
            predicate: 's.scanned_at >= p_since',
          },
        ],
      }),
    },
    {
      out: 'supabase/generated/search_clients.sql',
      sql: generateSearchRpc(clientsRoot, clientsFields, {
        displayColumns: [
          { name: 'id', type: 'uuid', expr: 'c.id' },
          { name: 'name', type: 'text', expr: 'c.name::text' },
          { name: 'company', type: 'text', expr: 'c.company::text' },
          { name: 'email', type: 'text', expr: 'c.email::text' },
          { name: 'phone', type: 'text', expr: 'c.phone::text' },
          { name: 'notes', type: 'text', expr: 'c.notes::text' },
          { name: 'created_at', type: 'timestamptz', expr: 'c.created_at' },
        ],
        // Every searchable column is on the root table, so the display needs
        // no joins at all. The template handles that without special-casing.
        displayJoins: [],
      }),
    },
    // Fleet, instant path. Asset identity only -- see the manifest for why the
    // relational half of section 5 is a separate, explicit surface.
    {
      out: 'supabase/generated/search_assets.sql',
      sql: generateSearchRpc(assetsRoot, assetsFields, {
        displayColumns: ASSET_DISPLAY_COLUMNS,
        displayJoins: ASSET_DISPLAY_JOINS,
        extraFilters: ASSET_FILTERS,
      }),
    },
    // Fleet, history path. Same root and same display shape, reached through
    // the six related tables; the only difference is which branches exist.
    {
      out: 'supabase/generated/search_assets_history.sql',
      sql: generateSearchRpc(assetsHistoryRoot, assetsHistoryFields, {
        displayColumns: ASSET_DISPLAY_COLUMNS,
        displayJoins: ASSET_DISPLAY_JOINS,
        extraFilters: ASSET_FILTERS,
      }),
    },
  ]
}

const check = process.argv.includes('--check')

let targets: Target[]
try {
  targets = build()
} catch (err) {
  if (err instanceof ManifestError) {
    console.error(`\nManifest error:\n  ${err.message}\n`)
    process.exit(1)
  }
  throw err
}

let drift = 0
for (const t of targets) {
  if (check) {
    let current = ''
    try {
      current = readFileSync(t.out, 'utf8').replace(/\r\n/g, '\n')
    } catch {
      console.error(`MISSING  ${t.out} -- run without --check to generate it`)
      drift++
      continue
    }
    if (current !== t.sql) {
      console.error(`DRIFT    ${t.out} differs from the manifest`)
      drift++
    } else {
      console.log(`ok       ${t.out}`)
    }
  } else {
    mkdirSync(dirname(t.out), { recursive: true })
    writeFileSync(t.out, t.sql, 'utf8')
    console.log(`wrote    ${t.out}`)
  }
}

if (check && drift > 0) {
  console.error(
    `\n${drift} file(s) out of date. Run: npx tsx scripts/build-search-rpcs.ts\n`
  )
  process.exit(1)
}
