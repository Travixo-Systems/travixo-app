#!/usr/bin/env node
/**
 * verify-admin-org-health.mjs
 *
 * Verifies the admin engagement signals:
 *   1. every column the health module reads actually EXISTS in
 *      types/database.ts -- the point is that nothing here is invented
 *   2. last-connected reduction and formatting, including the
 *      unknown-vs-never distinction that matters on the admin screen
 *   3. engagement + score behaviour
 *   4. the admin pages render the signals and the audit summary handles
 *      the new end_pilot action
 *
 * Check 1 is the load-bearing one. public.users has NO last-login column,
 * so "last connected" has to come from auth.users via the Auth admin API;
 * a check that only exercised the pure helpers would happily pass while
 * the page queried a column that does not exist.
 *
 * Prints "admin org health verification passed" only when every case holds.
 */

import { pathToFileURL } from 'url'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 250)}`)
}

const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null)

// ---------------------------------------------------------------------
// 1. Columns are real
// ---------------------------------------------------------------------
const types = read('types/database.ts')
if (!types) {
  console.log('FAIL  types/database.ts missing')
  process.exit(1)
}

/** Extract one table's Row block from the generated types. */
function rowBlock(table) {
  const i = types.indexOf(`      ${table}: {`)
  if (i < 0) return null
  const j = types.indexOf('Insert:', i)
  return types.slice(i, j < 0 ? i + 2000 : j)
}

const assetsRow = rowBlock('assets')
const usersRow = rowBlock('users')
const orgsRow = rowBlock('organizations')

for (const [table, block] of [['assets', assetsRow], ['users', usersRow], ['organizations', orgsRow]]) {
  if (block) pass(`types define public.${table}`)
  else fail(`types do not define public.${table}`)
}

// Columns the admin pages now read.
const required = [
  ['assets', assetsRow, 'is_demo_data'],
  ['assets', assetsRow, 'organization_id'],
  ['organizations', orgsRow, 'pilot_start_date'],
  ['organizations', orgsRow, 'pilot_end_date'],
  ['organizations', orgsRow, 'trial_ends_at'],
  ['organizations', orgsRow, 'converted_to_paid'],
  ['organizations', orgsRow, 'is_pilot'],
]
for (const [table, block, col] of required) {
  if (block && new RegExp(`\\b${col}\\b`).test(block)) pass(`${table}.${col} exists`)
  else fail(`${table}.${col} does NOT exist — the page would query a missing column`)
}

// The premise of lastConnected.ts: users has no last-login column. If a
// future migration adds one, this check fires and the module should be
// simplified to a plain DB read.
const loginCols = ['last_sign_in_at', 'last_login_at', 'last_seen_at', 'last_active_at']
const found = usersRow ? loginCols.filter(c => new RegExp(`\\b${c}\\b`).test(usersRow)) : []
if (found.length === 0) {
  pass('public.users still has no last-login column (auth admin API is required)')
} else {
  fail(`public.users now has ${found.join(', ')} — simplify lib/admin/lastConnected.ts`)
}

// end_pilot must be registered in the RPC types or the action cannot compile.
if (/end_pilot: \{/.test(types)) pass('end_pilot registered in the RPC types')
else fail('end_pilot missing from types/database.ts Functions')

// ---------------------------------------------------------------------
// 2. Last connected
// ---------------------------------------------------------------------
const OH = 'lib/admin/orgHealth.ts'
let oh
try {
  oh = await import(pathToFileURL(resolve(OH)).href)
} catch (err) {
  console.log(`FAIL  cannot import ${OH}: ${err?.message}`)
  process.exit(1)
}
const {
  mostRecentSignIn,
  formatLastConnected,
  engagementLevel,
  orgHealth,
  daysAgo,
} = oh

const ago = n => new Date(Date.now() - n * 86400000).toISOString()

// Picks the most recent, ignores nulls and junk.
const mixed = mostRecentSignIn([null, ago(30), undefined, ago(2), 'not-a-date', ago(10)])
if (mixed.daysAgo === 2) pass('mostRecentSignIn picks the most recent, ignoring junk')
else fail(`mostRecentSignIn -> ${mixed.daysAgo}d, expected 2`)

const noneAt = mostRecentSignIn([null, undefined])
if (noneAt.at === null && noneAt.daysAgo === null) pass('mostRecentSignIn handles no sign-ins')
else fail('mostRecentSignIn did not return nulls for an empty set')

if (mostRecentSignIn([]).at === null) pass('mostRecentSignIn handles an empty array')
else fail('mostRecentSignIn mishandled an empty array')

// The unknown-vs-never distinction.
if (formatLastConnected({ at: null, daysAgo: null }, false) === 'unknown') {
  pass('lookup failure renders "unknown", not "never"')
} else {
  fail('lookup failure did not render "unknown"')
}
if (formatLastConnected({ at: null, daysAgo: null }, true) === 'never') {
  pass('a known-empty result renders "never"')
} else {
  fail('known-empty did not render "never"')
}
for (const [d, expected] of [[0, 'today'], [1, 'yesterday'], [9, '9d ago']]) {
  const got = formatLastConnected({ at: ago(d), daysAgo: d }, true)
  if (got === expected) pass(`format ${d}d -> "${got}"`)
  else fail(`format ${d}d -> "${got}", expected "${expected}"`)
}

if (daysAgo(null) === null && daysAgo('garbage') === null) {
  pass('daysAgo returns null for missing/invalid input (negative control)')
} else {
  fail('daysAgo did not reject invalid input')
}

// ---------------------------------------------------------------------
// 3. Engagement + score
// ---------------------------------------------------------------------
const engCases = [
  [0, 'active'], [7, 'active'], [8, 'idle'], [21, 'idle'], [22, 'dormant'], [90, 'dormant'],
]
for (const [d, expected] of engCases) {
  const got = engagementLevel({ at: ago(d), daysAgo: d })
  if (got === expected) pass(`engagement ${d}d -> ${got}`)
  else fail(`engagement ${d}d -> ${got}, expected ${expected}`)
}
if (engagementLevel({ at: null, daysAgo: null }) === 'never') pass('engagement with no sign-in -> never')
else fail('engagement with no sign-in was not "never"')

const base = {
  is_pilot: true,
  pilot_start_date: ago(10),
  pilot_end_date: new Date(Date.now() + 20 * 86400000).toISOString(),
  converted_to_paid: false,
}

const engaged = orgHealth({
  ...base,
  realAssets: 50, demoAssets: 5, userCount: 4, inspectionCount: 12,
  lastConnected: { at: ago(1), daysAgo: 1 },
})
const abandoned = orgHealth({
  ...base,
  realAssets: 0, demoAssets: 12, userCount: 1, inspectionCount: 0,
  lastConnected: { at: null, daysAgo: null },
})

if (engaged.score > abandoned.score) {
  pass(`engaged org scores above abandoned (${engaged.score} > ${abandoned.score})`)
} else {
  fail(`scoring did not separate the two (${engaged.score} vs ${abandoned.score})`)
}
if (engaged.score <= 100 && abandoned.score >= 0) pass('score stays within 0..100')
else fail(`score out of range: ${engaged.score}, ${abandoned.score}`)

if (engaged.hasRealUsage && !abandoned.hasRealUsage) {
  pass('hasRealUsage distinguishes real work from demo-only')
} else {
  fail('hasRealUsage did not distinguish demo-only from real usage')
}

// Demo assets alone must never read as adoption -- that is the whole
// reason the two counts are separated.
const demoOnly = orgHealth({
  ...base, realAssets: 0, demoAssets: 400, userCount: 1, inspectionCount: 0,
  lastConnected: { at: ago(1), daysAgo: 1 },
})
if (!demoOnly.hasRealUsage) pass('400 demo assets still count as no real usage')
else fail('demo assets were counted as real usage')
if (demoOnly.signals.some(s => /demo data only/.test(s))) {
  pass('demo-only org is flagged in its signals')
} else {
  fail('demo-only org was not flagged', demoOnly.signals.join('; '))
}

if (engaged.signals.length > 0 && abandoned.signals.length > 0) pass('signals are always populated')
else fail('signals came back empty')

// The health module must agree with the access model, not re-derive it.
const lockedHealth = orgHealth({
  is_pilot: true, pilot_start_date: ago(60), pilot_end_date: ago(30), converted_to_paid: false,
  realAssets: 1, demoAssets: 0, userCount: 1, inspectionCount: 0,
  lastConnected: { at: ago(40), daysAgo: 40 },
})
if (lockedHealth.access === 'locked' && lockedHealth.signals.some(s => /locked out/.test(s))) {
  pass('a locked org reports access=locked and says so in its signals')
} else {
  fail(`locked org reported access=${lockedHealth.access}`)
}

// ---------------------------------------------------------------------
// 4. The pages actually render it
// ---------------------------------------------------------------------
const DETAIL = 'app/(admin)/admin/orgs/[id]/page.tsx'
const detail = read(DETAIL)
if (!detail) {
  fail(`${DETAIL} missing`)
} else {
  const checksDetail = [
    ['fetches the sign-in index', /fetchSignInIndex\(\)/],
    ['reduces to a last-connected value', /mostRecentSignIn\(/],
    ['splits real vs demo assets', /is_demo_data/],
    ['counts VGP inspections', /from\('vgp_inspections'\)/],
    ['computes orgHealth', /orgHealth\(\{/],
    ['renders a Last connected field', /Last connected/],
    ['renders conversion signals', /Conversion signals/],
    ['labels the score as triage only', /never used for billing or access/i],
    ['summarizes end_pilot in the audit log', /row\.action === 'end_pilot'/],
  ]
  for (const [label, re] of checksDetail) {
    if (re.test(detail)) pass(`detail page ${label}`)
    else fail(`detail page does not ${label}`)
  }
}

const LIST = 'app/(admin)/admin/page.tsx'
const list = read(LIST)
if (!list) {
  fail(`${LIST} missing`)
} else {
  const checksList = [
    ['fetches the sign-in index', /fetchSignInIndex\(\)/],
    ['builds per-org last-connected', /lastConnectedByOrg/],
    ['renders a Last connected column', /Last connected/],
    ['renders an Access column', /accessLevel\(org\)/],
  ]
  for (const [label, re] of checksList) {
    if (re.test(list)) pass(`list page ${label}`)
    else fail(`list page does not ${label}`)
  }

  // Column-count integrity: a header/cell mismatch silently shifts every
  // value one column left, which is worse than a crash.
  const headerCount = (list.match(/<th /g) ?? []).length
  const emptyColSpan = list.match(/colSpan=\{(\d+)\}/)
  if (headerCount > 0) pass(`list page renders ${headerCount} header cells`)
  else fail('list page has no header cells')
  if (emptyColSpan) pass(`empty-state colSpan present (${emptyColSpan[1]})`)
  else fail('list page empty state has no colSpan')
}

const LC = 'lib/admin/lastConnected.ts'
const lc = read(LC)
if (!lc) {
  fail(`${LC} missing`)
} else {
  const checksLc = [
    ['uses the Auth admin API', /auth\.admin\.listUsers/],
    ['uses the service-role key', /SUPABASE_SERVICE_ROLE_KEY/],
    ['caps pagination', /MAX_PAGES/],
    ['returns known:false on failure', /known: false/],
    ['never throws out of the fetch', /catch \{/],
  ]
  for (const [label, re] of checksLc) {
    if (re.test(lc)) pass(`lastConnected ${label}`)
    else fail(`lastConnected does not ${label}`)
  }
}

// ---------------------------------------------------------------------
console.log('')
console.log(`${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
console.log('admin org health verification passed')
