/**
 * Backfill category_id for assets that have none.
 *
 *   node scripts/backfill-asset-categories.mjs           # dry run (default)
 *   node scripts/backfill-asset-categories.mjs --apply   # actually write
 *   node scripts/backfill-asset-categories.mjs --apply --org "Ariane"
 *
 * WHY
 *   The importer now infers categories, but that only helps NEW imports.
 *   Assets created before it (seeded, or imported by the old code) still have
 *   category_id = NULL and show as "Non catégorisé" in the fleet and VGP
 *   views.
 *
 * SAFETY -- this only ever FILLS BLANKS.
 *   Assets that already have a category are never touched, even when
 *   inference disagrees with the stored value. That is deliberate: most
 *   disagreements are alternative-but-valid taxonomies chosen by the customer
 *   ("Engins de Chantier" vs "Engin de chantier", "Échafaudages" vs
 *   "Échafaudage"), and silently rewriting them would destroy their naming.
 *   Genuine miscategorisations are reported at the end for a human to judge,
 *   not fixed automatically.
 *
 *   Assets whose name yields no confident guess are left NULL rather than
 *   forced into a category.
 *
 * Categories are matched per-organization, case- and accent-insensitively, so
 * an existing "Chariot elevateur" is reused rather than duplicated.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const APPLY = process.argv.includes('--apply')
const orgFilterIdx = process.argv.indexOf('--org')
const ORG_FILTER = orgFilterIdx !== -1 ? process.argv[orgFilterIdx + 1] : null

/* ---- load the same inference the importer uses --------------------- */
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-'))
try {
  execFileSync(process.execPath, [
    'node_modules/typescript/lib/tsc.js',
    'lib/import/categoryInference.ts',
    '--outDir', out, '--module', 'esnext', '--target', 'es2022',
  ], { stdio: 'pipe' })
} catch { /* ambient @types noise */ }
const emitted = path.join(out, 'categoryInference.js')
if (!fs.existsSync(emitted)) {
  console.error('FAIL: categoryInference.ts did not compile.')
  process.exit(1)
}
const { inferCategoryFromName, norm } = await import(pathToFileURL(emitted).href)

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

/* ---- load state ---------------------------------------------------- */
const orgs = await (await fetch(`${url}/rest/v1/organizations?select=id,name`, { headers: readH })).json()
const orgName = Object.fromEntries(orgs.map(o => [o.id, o.name]))
const targetOrgs = ORG_FILTER
  ? new Set(orgs.filter(o => o.name.toLowerCase().includes(ORG_FILTER.toLowerCase())).map(o => o.id))
  : null
if (ORG_FILTER && targetOrgs.size === 0) {
  console.error(`No organization matching "${ORG_FILTER}".`)
  process.exit(1)
}

let categories = await (await fetch(
  `${url}/rest/v1/asset_categories?select=id,name,organization_id&limit=99999`, { headers: readH })).json()

const assets = (await (await fetch(
  `${url}/rest/v1/assets?select=id,name,category_id,organization_id&limit=99999`, { headers: readH })).json())
  .filter(a => !a.category_id)
  .filter(a => !targetOrgs || targetOrgs.has(a.organization_id))

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}${ORG_FILTER ? ` (org filter: "${ORG_FILTER}")` : ''}`)
console.log(`assets with no category: ${assets.length}\n`)

/* ---- plan ---------------------------------------------------------- */
const catKey = (orgId, name) => `${orgId}|${norm(name)}`
const catIndex = new Map(categories.map(c => [catKey(c.organization_id, c.name), c.id]))

const toCreate = new Map()   // key -> { organization_id, name }
const updates = []           // { id, orgId, categoryName, assetName }
const skipped = []

for (const a of assets) {
  const guess = inferCategoryFromName(a.name)
  if (!guess.category) { skipped.push(a.name); continue }
  const key = catKey(a.organization_id, guess.category)
  if (!catIndex.has(key) && !toCreate.has(key)) {
    toCreate.set(key, { organization_id: a.organization_id, name: guess.category })
  }
  updates.push({ id: a.id, orgId: a.organization_id, categoryName: guess.category, assetName: a.name })
}

const byOrg = {}
for (const u of updates) {
  const k = orgName[u.orgId] ?? u.orgId
  byOrg[k] = byOrg[k] ?? {}
  byOrg[k][u.categoryName] = (byOrg[k][u.categoryName] ?? 0) + 1
}
for (const [org, cats] of Object.entries(byOrg).sort()) {
  console.log(`  ${org}`)
  for (const [c, n] of Object.entries(cats).sort()) console.log(`      ${String(n).padStart(4)}  ${c}`)
}
console.log(`\nwould set a category on : ${updates.length} assets`)
console.log(`new categories to create: ${toCreate.size}`)
console.log(`left uncategorised      : ${skipped.length}${skipped.length ? ` (${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ', …' : ''})` : ''}`)

if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to write these changes.')
  fs.rmSync(out, { recursive: true, force: true })
  process.exit(0)
}

/* ---- apply --------------------------------------------------------- */
if (toCreate.size > 0) {
  const rows = [...toCreate.values()]
  const res = await fetch(`${url}/rest/v1/asset_categories`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    console.error('Failed to create categories:', res.status, (await res.text()).slice(0, 300))
    process.exit(1)
  }
  const created = await res.json()
  for (const c of created) catIndex.set(catKey(c.organization_id, c.name), c.id)
  console.log(`\ncreated ${created.length} categories`)
}

let done = 0, failed = 0
for (const u of updates) {
  const categoryId = catIndex.get(catKey(u.orgId, u.categoryName))
  if (!categoryId) { failed++; continue }
  // Guard in the query itself: only write if the row is STILL uncategorised,
  // so a concurrent edit is never overwritten.
  const res = await fetch(`${url}/rest/v1/assets?id=eq.${u.id}&category_id=is.null`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ category_id: categoryId }),
  })
  if (res.ok) done++; else failed++
}
console.log(`updated ${done} assets${failed ? `, ${failed} failed` : ''}`)

/* ---- report disagreements (never auto-fixed) ----------------------- */
categories = await (await fetch(
  `${url}/rest/v1/asset_categories?select=id,name,organization_id&limit=99999`, { headers: readH })).json()
const nameById = Object.fromEntries(categories.map(c => [c.id, c.name]))
const all = await (await fetch(
  `${url}/rest/v1/assets?select=name,category_id,organization_id&limit=99999`, { headers: readH })).json()

const disagree = new Map()
for (const a of all) {
  if (!a.category_id) continue
  const cur = nameById[a.category_id]
  const guess = inferCategoryFromName(a.name).category
  if (!cur || !guess) continue
  if (norm(cur) === norm(guess)) continue
  const k = `${cur}  ->  ${guess}`
  disagree.set(k, (disagree.get(k) ?? 0) + 1)
}
if (disagree.size) {
  console.log('\nNOT changed -- existing categories that differ from inference.')
  console.log('Many are just alternative spellings; review before acting:\n')
  ;[...disagree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`))
}

fs.rmSync(out, { recursive: true, force: true })
console.log('\nDone.')
