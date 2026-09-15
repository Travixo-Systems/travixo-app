#!/usr/bin/env node
/**
 * verify-admin-console-live.mjs
 *
 * GATES-ADMIN-CONSOLE.md A0: prove a platform admin can actually READ the data
 * the console renders.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DOES NOT USE THE SERVICE-ROLE KEY
 * ---------------------------------------------------------------------------
 *
 * Because the pages do not. Every /admin page reads through
 * lib/supabase/server.ts -- the cookie-bound ANON client -- so every admin read
 * is RLS-scoped. The service-role key appears in exactly one place in the whole
 * admin surface: lib/admin/lastConnected.ts, for the Auth admin API.
 *
 * scripts/verify-admin-evidence-live.mjs probes with the service-role key. That
 * is why it recorded 561 documentary gaps while /admin/evidence rendered a
 * green all-clear: the gate and the page were looking through different eyes,
 * and only the page's view is the product. A gate may only claim what the page
 * can see.
 *
 * So this mints a REAL session for a real platform_admins member and reads
 * through the anon key, exactly as a request would. The service-role read is
 * kept alongside purely as ground truth to compare against.
 *
 * ---------------------------------------------------------------------------
 * WHAT A FAILURE HERE MEANS
 * ---------------------------------------------------------------------------
 *
 * A table reading 0 under the admin session while service-role sees rows is not
 * "no data". It is a missing super_admin policy, and every surface built over
 * that table will render a confident, empty, wrong answer. That is the precise
 * failure this gate exists to make loud.
 *
 * Read-only. Mints a session; writes nothing.
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const ENV_FILE = process.env.VERIFY_ENV_FILE || '.env.local'

/** A platform_admins member with organization_id NULL (the B1 shape). */
const ADMIN_EMAIL = process.env.VERIFY_ADMIN_EMAIL || 'travixosystems@gmail.com'

/**
 * The nine tables this branch added a super_admin SELECT policy to. Each one
 * previously returned zero rows and no error for an org-less admin.
 */
const FIXED_BY_THIS_BRANCH = [
  'vgp_inspections',
  'vgp_schedules',
  'rentals',
  'vgp_alerts',
  'vgp_digest_deliveries',
  'clients',
  'subscriptions',
  'billing_events',
  'scans',
]

/** Tables that already carried a super_admin policy (or are catalogue-public). */
const ALREADY_WORKING = [
  'assets',
  'organizations',
  'users',
  'admin_audit_log',
  'vgp_regulatory_profiles',
]

let failures = 0
let checks = 0
const pass = (m) => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 300)}`)
}

function loadEnv(file) {
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )
}

const env = loadEnv(ENV_FILE)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !ANON || !SVC) {
  console.log(`FAIL  ${ENV_FILE} is missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY`)
  process.exit(1)
}

const svc = createClient(URL, SVC, { auth: { persistSession: false } })

// ---------------------------------------------------------------------------
// Mint a real session for the admin.
//
// generateLink + verifyOtp, NOT a password sign-in: no admin password lives in
// the environment and none should. verifyOtp accepts token_hash and type ONLY
// -- passing `email` alongside is rejected with "Only the token_hash and type
// should be provided".
// ---------------------------------------------------------------------------
const { data: link, error: linkErr } = await svc.auth.admin.generateLink({
  type: 'magiclink',
  email: ADMIN_EMAIL,
})
if (linkErr) {
  fail(`could not mint a session for ${ADMIN_EMAIL}`, linkErr.message)
  process.exit(1)
}

const anonForVerify = createClient(URL, ANON, { auth: { persistSession: false } })
const { data: sess, error: vErr } = await anonForVerify.auth.verifyOtp({
  type: 'magiclink',
  token_hash: link.properties.hashed_token,
})
if (vErr || !sess?.session) {
  fail(`could not verify the minted link for ${ADMIN_EMAIL}`, vErr?.message)
  process.exit(1)
}

// Confirm the account really is the B1 shape this gate assumes. An admin that
// HAS an organization would pass the tenant policies for that org and mask the
// very defect being tested.
const { data: profile } = await svc
  .from('users')
  .select('organization_id')
  .eq('id', sess.user.id)
  .maybeSingle()

if (profile?.organization_id == null) {
  pass(`${ADMIN_EMAIL} is org-less (organization_id NULL), the B1 platform-admin shape`)
} else {
  fail(
    `${ADMIN_EMAIL} has organization_id ${profile.organization_id}; this gate needs an org-less admin or it proves nothing`
  )
}

// The client every admin page actually uses: anon key + the admin's session.
const asAdmin = createClient(URL, ANON, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
})

const { data: isAdmin, error: rpcErr } = await asAdmin.rpc('is_super_admin')
if (isAdmin === true) pass('is_super_admin() returns true under the minted session')
else fail('is_super_admin() did not return true under the minted session', rpcErr?.message)

// ---------------------------------------------------------------------------
// The comparison.
// ---------------------------------------------------------------------------
const count = async (client, table) => {
  const { count: n, error } = await client.from(table).select('*', { count: 'exact', head: true })
  return { n: n ?? -1, error }
}

console.log('')
console.log('  table                      service_role   as_admin    verdict')
const blind = []
for (const table of [...FIXED_BY_THIS_BRANCH, ...ALREADY_WORKING]) {
  const truth = await count(svc, table)
  const seen = await count(asAdmin, table)

  let verdict
  if (seen.error) {
    verdict = `ERROR ${seen.error.message}`
    blind.push(table)
  } else if (seen.n === truth.n) {
    verdict = 'MATCH'
  } else if (seen.n === 0 && truth.n > 0) {
    verdict = `BLIND (0 of ${truth.n})`
    blind.push(table)
  } else {
    verdict = `PARTIAL (${seen.n} of ${truth.n})`
    blind.push(table)
  }

  const tag = FIXED_BY_THIS_BRANCH.includes(table) ? '' : '   (pre-existing)'
  console.log(
    `  ${table.padEnd(26)} ${String(truth.n).padEnd(14)} ${String(seen.error ? 'ERR' : seen.n).padEnd(11)} ${verdict}${tag}`
  )
}
console.log('')

if (blind.length === 0) {
  pass(`all ${FIXED_BY_THIS_BRANCH.length + ALREADY_WORKING.length} tables are fully visible to the platform admin`)
} else {
  fail(
    `${blind.length} table(s) the admin cannot fully read`,
    `${blind.join(', ')} -- a surface over these renders a confident empty answer`
  )
}

// ---------------------------------------------------------------------------
// The detectors, run through BOTH clients. They must agree.
// ---------------------------------------------------------------------------
const { pathToFileURL } = await import('url')
const { resolve } = await import('path')
await import(pathToFileURL(resolve('scripts/ts-alias-loader.mjs')).href)

const { detectAtomicDisagreement } = await import(
  pathToFileURL(resolve('lib/admin/evidence/atomicDisagreement.ts')).href
)
const { detectDocumentaryGaps } = await import(
  pathToFileURL(resolve('lib/admin/evidence/documentaryGaps.ts')).href
)
const { detectRentalExpiry } = await import(
  pathToFileURL(resolve('lib/admin/evidence/rentalExpiry.ts')).href
)

const runDetectors = async (client) => {
  const [d1, d2, d3] = await Promise.all([
    detectAtomicDisagreement(client),
    detectDocumentaryGaps(client),
    detectRentalExpiry(client),
  ])
  return { d1, d2, d3 }
}

const truthRun = await runDetectors(svc)
const adminRun = await runDetectors(asAdmin)

for (const [key, run] of [['service_role', truthRun], ['admin session', adminRun]]) {
  const broken = ['d1', 'd2', 'd3'].filter((d) => run[d].failed)
  if (broken.length === 0) pass(`all three detectors ran under ${key}`)
  else fail(`detector(s) failed to run under ${key}`, broken.join(', '))
}

const comparisons = [
  ['D1 rows', truthRun.d1.rows.length, adminRun.d1.rows.length],
  ['D1 assetsInspected', truthRun.d1.assetsInspected, adminRun.d1.assetsInspected],
  ['D2 rows', truthRun.d2.rows.length, adminRun.d2.rows.length],
  ['D2 inspectionsTotal', truthRun.d2.inspectionsTotal, adminRun.d2.inspectionsTotal],
  ['D3 rows', truthRun.d3.rows.length, adminRun.d3.rows.length],
  ['D3 activeRentals', truthRun.d3.activeRentals, adminRun.d3.activeRentals],
  ['D3 unscheduled', truthRun.d3.unscheduled.length, adminRun.d3.unscheduled.length],
]

console.log('')
const disagreed = []
for (const [label, truth, seen] of comparisons) {
  const ok = truth === seen
  if (!ok) disagreed.push(label)
  console.log(`  ${ok ? 'MATCH ' : 'DIFFER'} ${label.padEnd(22)} service=${truth} admin=${seen}`)
}
console.log('')

if (disagreed.length === 0) {
  pass('the detectors report identical counts through both clients')
} else {
  fail('the detectors disagree between clients', disagreed.join(', '))
}

// Record the live counts, so the numbers live beside the rules that made them.
const ruleA = adminRun.d1.rows.filter((r) => r.rule === 'failed_asset_in_service').length
const ruleB = adminRun.d1.rows.filter((r) => r.rule === 'failed_schedule_not_failed').length
const gapA = adminRun.d2.rows.filter((r) => r.kind === 'missing_certificate').length
const gapB = adminRun.d2.rows.filter((r) => r.kind === 'unresolvable_reference').length

console.log('  live counts, as the page sees them:')
console.log(`    D1  ${adminRun.d1.rows.length} rows (rule A ${ruleA}, rule B ${ruleB}) over ${adminRun.d1.assetsInspected} inspected assets`)
console.log(`    D2  ${adminRun.d2.rows.length} rows (gap A ${gapA}, gap B ${gapB}) of ${adminRun.d2.inspectionsTotal} inspections`)
console.log(`    D3  ${adminRun.d3.rows.length} rows over ${adminRun.d3.activeRentals} active rentals; ${adminRun.d3.unscheduled.length} unscheduled`)

console.log('')
console.log(`--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) {
  console.log('\nA0 NOT met. A table the admin cannot read renders as "nothing wrong".')
  process.exit(1)
}
console.log('\nA0_ADMIN_SEES_ALL_TABLES')
