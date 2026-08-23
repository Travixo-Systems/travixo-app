/**
 * Backfill rentals.client_id for rentals that have none.
 *
 *   node scripts/backfill-rental-client-ids.mjs           # dry run (default)
 *   node scripts/backfill-rental-client-ids.mjs --apply   # actually write
 *   node scripts/backfill-rental-client-ids.mjs --apply --org "Ariane"
 *
 * WHY
 *   rentals.client_id was added by the client-recall migration AFTER the
 *   rental system shipped, so it is nullable and every rental created before
 *   it (plus any checkout where client creation hit a duplicate name) stores
 *   only the denormalized client_name text.
 *
 *   A NULL client_id means: no rental history on the client page, and no VGP
 *   recall notice can reach that client - which is the whole point of the
 *   feature. Linking them restores both.
 *
 * SAFETY -- this only ever FILLS BLANKS.
 *   Rentals that already have a client_id are never touched. Matching is
 *   per-organization and case/accent-insensitive against clients.name, the
 *   same key the unique index uses. A rental whose client_name matches no
 *   client, or matches ambiguously, is left NULL and reported for a human.
 *
 *   No client records are created. Inventing clients from free-text rental
 *   names would produce duplicates of records the customer may already have
 *   under a slightly different spelling.
 */
import fs from 'node:fs'

const APPLY = process.argv.includes('--apply')
const orgFilterIdx = process.argv.indexOf('--org')
const ORG_FILTER = orgFilterIdx !== -1 ? process.argv[orgFilterIdx + 1] : null

/* ---- credentials --------------------------------------------------- */
const env = fs.readFileSync('.env.local', 'utf8')
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const svc = get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !svc) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const H = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' }
const readH = { ...H, Range: '0-99999' }

/** Same normalization idea as the clients unique index: case- and accent-insensitive. */
const norm = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

/* ---- load state ---------------------------------------------------- */
const orgs = await (await fetch(`${url}/rest/v1/organizations?select=id,name`, { headers: readH })).json()
const orgName = Object.fromEntries(orgs.map((o) => [o.id, o.name]))
const targetOrgs = ORG_FILTER
  ? new Set(orgs.filter((o) => o.name.toLowerCase().includes(ORG_FILTER.toLowerCase())).map((o) => o.id))
  : null
if (ORG_FILTER && targetOrgs.size === 0) {
  console.error(`No organization matching "${ORG_FILTER}".`)
  process.exit(1)
}

const clients = await (
  await fetch(`${url}/rest/v1/clients?select=id,name,organization_id&limit=99999`, { headers: readH })
).json()

const rentals = (
  await (
    await fetch(
      `${url}/rest/v1/rentals?select=id,client_id,client_name,organization_id,status&limit=99999`,
      { headers: readH }
    )
  ).json()
)
  .filter((r) => !r.client_id)
  .filter((r) => !targetOrgs || targetOrgs.has(r.organization_id))

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}${ORG_FILTER ? ` (org filter: "${ORG_FILTER}")` : ''}`)
console.log(`rentals with no client_id: ${rentals.length}\n`)

if (rentals.length === 0) {
  console.log('Nothing to do.')
  process.exit(0)
}

/* ---- index clients per org, detecting ambiguity --------------------- */
const key = (orgId, name) => `${orgId}|${norm(name)}`
const clientIndex = new Map() // key -> id | 'AMBIGUOUS'
for (const c of clients) {
  const k = key(c.organization_id, c.name)
  clientIndex.set(k, clientIndex.has(k) ? 'AMBIGUOUS' : c.id)
}

/* ---- plan ----------------------------------------------------------- */
const updates = []
const unmatched = []
const ambiguous = []

for (const r of rentals) {
  const hit = clientIndex.get(key(r.organization_id, r.client_name))
  if (!hit) {
    unmatched.push(r)
  } else if (hit === 'AMBIGUOUS') {
    ambiguous.push(r)
  } else {
    updates.push({ id: r.id, clientId: hit, orgId: r.organization_id, name: r.client_name, status: r.status })
  }
}

const byOrg = {}
for (const u of updates) {
  byOrg[u.orgId] = (byOrg[u.orgId] || 0) + 1
}

console.log('MATCHED (will link):')
for (const [orgId, n] of Object.entries(byOrg)) {
  console.log(`  ${orgName[orgId] || orgId}: ${n}`)
}
const activeCount = updates.filter((u) => u.status === 'active').length
console.log(`  total: ${updates.length} (${activeCount} currently active)\n`)

if (unmatched.length) {
  const names = [...new Set(unmatched.map((r) => `${orgName[r.organization_id] || '?'} / ${r.client_name}`))]
  console.log(`UNMATCHED (${unmatched.length} rentals, left NULL) - no client record with this name:`)
  for (const n of names.slice(0, 40)) console.log(`  ${n}`)
  if (names.length > 40) console.log(`  ... and ${names.length - 40} more`)
  console.log('')
}

if (ambiguous.length) {
  console.log(`AMBIGUOUS (${ambiguous.length} rentals, left NULL) - multiple clients share this name:`)
  for (const r of ambiguous.slice(0, 20)) {
    console.log(`  ${orgName[r.organization_id] || '?'} / ${r.client_name}`)
  }
  console.log('')
}

if (!APPLY) {
  console.log('Dry run. Re-run with --apply to write these links.')
  process.exit(0)
}

/* ---- apply ---------------------------------------------------------- */
let ok = 0
let failed = 0

for (const u of updates) {
  const res = await fetch(`${url}/rest/v1/rentals?id=eq.${u.id}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ client_id: u.clientId }),
  })
  if (res.ok) {
    ok++
  } else {
    failed++
    console.error(`  FAILED ${u.id} (${u.name}): ${res.status} ${await res.text()}`)
  }
}

console.log(`\nLinked ${ok} rental(s).${failed ? ` ${failed} failed.` : ''}`)
if (unmatched.length || ambiguous.length) {
  console.log(`Left NULL: ${unmatched.length} unmatched, ${ambiguous.length} ambiguous.`)
}
