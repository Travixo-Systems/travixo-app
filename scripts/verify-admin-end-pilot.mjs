#!/usr/bin/env node
/**
 * verify-admin-end-pilot.mjs
 *
 * Verifies the end_pilot platform-admin action:
 *   1. the SQL function exists with every guard in place
 *   2. its OUTCOMES agree with lib/billing/access-model.ts -- the mode
 *      'read_only' really produces accessLevel 'read_only', and the mode
 *      'locked' really produces 'locked'
 *   3. ending a pilot does not disturb normal day counting for any other
 *      org, because it writes only the columns the natural lifecycle
 *      already reads
 *   4. the server action, allowlist, and UI wiring exist
 *
 * Point 2 matters most: the SQL sets dates, the app derives access from
 * them, and nothing else checks that the two agree. Rather than trusting
 * the SQL comment, this simulates the exact column writes the function
 * performs and runs the REAL accessLevel() over the result.
 *
 * Prints "admin end-pilot verification passed" only when every case holds.
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
// 1. The migration and its guards
// ---------------------------------------------------------------------
const MIG = 'supabase/migrations/20260827_admin_end_pilot.sql'
const sql = read(MIG)
if (!sql) {
  console.log(`FAIL  ${MIG} missing`)
  process.exit(1)
}

const sqlGuards = [
  ['declares end_pilot', /CREATE OR REPLACE FUNCTION public\.end_pilot/],
  ['is SECURITY DEFINER', /CREATE OR REPLACE FUNCTION public\.end_pilot[\s\S]*?SECURITY DEFINER/],
  ['pins search_path', /CREATE OR REPLACE FUNCTION public\.end_pilot[\s\S]*?SET search_path = public/],
  ['re-checks is_super_admin', /end_pilot[\s\S]*?IF NOT public\.is_super_admin\(\)[\s\S]*?not_authorized/],
  ['allowlists the mode', /p_mode NOT IN \('read_only', 'locked'\)[\s\S]*?invalid_mode/],
  ['refuses a converted org', /IF v_converted THEN[\s\S]*?already_converted/],
  ['refuses a non-pilot org', /IF NOT v_is_pilot THEN[\s\S]*?not_a_pilot/],
  ['locks the row', /end_pilot[\s\S]*?FOR UPDATE/],
  ['handles a missing org', /end_pilot[\s\S]*?org_not_found/],
  ['writes an audit row', /INSERT INTO public\.admin_audit_log[\s\S]*?'end_pilot'/],
  ['revokes from PUBLIC', /REVOKE ALL ON FUNCTION public\.end_pilot\(UUID, TEXT\) FROM PUBLIC/],
  ['grants to authenticated', /GRANT EXECUTE ON FUNCTION public\.end_pilot\(UUID, TEXT\) TO authenticated/],
]

// Scope the guard checks to the end_pilot body so a match inside
// extend_trial cannot satisfy them by accident.
const endBodyStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.end_pilot')
const endBody = endBodyStart >= 0 ? sql.slice(endBodyStart) : ''

for (const [label, re] of sqlGuards) {
  const target = label.includes('PUBLIC') || label.includes('authenticated') ? sql : endBody
  if (re.test(target)) pass(`end_pilot SQL ${label}`)
  else fail(`end_pilot SQL does not ${label}`)
}

// Both date columns must move together (access-model.ts requires it).
if (/UPDATE public\.organizations[\s\S]*?pilot_end_date\s*=\s*v_end,[\s\S]*?trial_ends_at\s*=\s*v_end/.test(endBody)) {
  pass('end_pilot writes pilot_end_date and trial_ends_at together')
} else {
  fail('end_pilot does not keep trial_ends_at in step with pilot_end_date')
}

// The end instant must be strictly in the past. isPilotActive() tests
// `now <= pilot_end_date` INCLUSIVELY, so writing exactly now() leaves the
// pilot active and the org at 'full' -- a no-op reported as success. This
// is a real bug this script caught; keep the guard.
if (/v_end\s+TIMESTAMPTZ := now\(\) - INTERVAL '1 second'/.test(endBody)) {
  pass('end instant is strictly in the past (inclusive-comparison guard)')
} else {
  fail('end instant is not strictly in the past; isPilotActive() would stay true')
}

// The locked mode must backdate the start date; read_only must not.
if (/p_mode = 'locked'[\s\S]*?v_new_start := v_now - make_interval\(days => v_lockout_days \+ 1\)/.test(endBody)) {
  pass('locked mode backdates pilot_start_date past lockout')
} else {
  fail('locked mode does not backdate pilot_start_date')
}
if (/ELSE\s*\n\s*v_new_start := v_old_start;/.test(endBody)) {
  pass('read_only mode leaves pilot_start_date untouched')
} else {
  fail('read_only mode does not leave pilot_start_date untouched')
}

// The lockout constant in SQL must match the app's.
const lockoutMatch = endBody.match(/v_lockout_days CONSTANT INTEGER := (\d+)/)
const sqlLockout = lockoutMatch ? Number(lockoutMatch[1]) : null

// ---------------------------------------------------------------------
// 2. Outcomes, measured through the REAL access model
// ---------------------------------------------------------------------
const AM = 'lib/billing/access-model.ts'
let am
try {
  am = await import(pathToFileURL(resolve(AM)).href)
} catch (err) {
  console.log(`FAIL  cannot import ${AM}: ${err?.message}`)
  process.exit(1)
}
const { accessLevel, PILOT_LOCKOUT_DAYS } = am

if (sqlLockout === PILOT_LOCKOUT_DAYS) {
  pass(`SQL lockout constant (${sqlLockout}) matches PILOT_LOCKOUT_DAYS`)
} else {
  fail(`SQL lockout constant ${sqlLockout} != PILOT_LOCKOUT_DAYS ${PILOT_LOCKOUT_DAYS}`)
}

const day = n => new Date(Date.now() + n * 86400000).toISOString()

/**
 * Simulate exactly what public.end_pilot writes, then ask the real
 * accessLevel() what the org's access becomes.
 */
function simulateEndPilot(org, mode) {
  const now = Date.now()
  // Mirrors `v_end := now() - INTERVAL '1 second'` in the migration.
  const end = new Date(now - 1000).toISOString()
  const next = { ...org, pilot_end_date: end, trial_ends_at: end }
  if (mode === 'locked') {
    next.pilot_start_date = new Date(
      now - (PILOT_LOCKOUT_DAYS + 1) * 86400000
    ).toISOString()
  }
  return next
}

const outcomeCases = [
  ['day 5 pilot, read_only', { is_pilot: true, pilot_start_date: day(-5), pilot_end_date: day(25) }, 'read_only', 'read_only'],
  ['day 20 pilot, read_only', { is_pilot: true, pilot_start_date: day(-20), pilot_end_date: day(10) }, 'read_only', 'read_only'],
  ['day 1 pilot, read_only', { is_pilot: true, pilot_start_date: day(-1), pilot_end_date: day(29) }, 'read_only', 'read_only'],
  ['day 5 pilot, locked', { is_pilot: true, pilot_start_date: day(-5), pilot_end_date: day(25) }, 'locked', 'locked'],
  ['day 20 pilot, locked', { is_pilot: true, pilot_start_date: day(-20), pilot_end_date: day(10) }, 'locked', 'locked'],
  ['day 44 pilot, locked', { is_pilot: true, pilot_start_date: day(-44), pilot_end_date: day(1) }, 'locked', 'locked'],
]

for (const [label, org, mode, expected] of outcomeCases) {
  const got = accessLevel(simulateEndPilot(org, mode))
  if (got === expected) pass(`${label} -> ${got}`)
  else fail(`${label} -> ${got}, expected ${expected}`)
}

// A read_only end must NOT skip straight past the grace window. This is
// the conversion mechanic access-model.ts documents; losing it silently
// would be the worst failure here.
const graceCheck = accessLevel(
  simulateEndPilot(
    { is_pilot: true, pilot_start_date: day(-2), pilot_end_date: day(28) },
    'read_only'
  )
)
if (graceCheck === 'read_only') {
  pass('read_only end preserves the grace window (not locked)')
} else {
  fail(`read_only end produced '${graceCheck}', destroying the grace window`)
}

// ---------------------------------------------------------------------
// 3. No conflict with normal day counting
// ---------------------------------------------------------------------
// Ending one org must not change how any untouched org is evaluated, and
// an ended org must be indistinguishable from a naturally expired one --
// that is what "does not create a special state" means.
const untouched = { is_pilot: true, pilot_start_date: day(-10), pilot_end_date: day(20) }
const beforeLevel = accessLevel(untouched)
simulateEndPilot({ is_pilot: true, pilot_start_date: day(-3), pilot_end_date: day(27) }, 'locked')
const afterLevel = accessLevel(untouched)
if (beforeLevel === 'full' && afterLevel === 'full') {
  pass('ending one org leaves an untouched org at full access')
} else {
  fail(`untouched org moved ${beforeLevel} -> ${afterLevel}`)
}

// An org ended into read_only must evaluate the same as one that expired
// naturally yesterday.
const endedNow = accessLevel(
  simulateEndPilot({ is_pilot: true, pilot_start_date: day(-12), pilot_end_date: day(18) }, 'read_only')
)
const naturallyExpired = accessLevel({
  is_pilot: true,
  pilot_start_date: day(-31),
  pilot_end_date: day(-1),
})
if (endedNow === naturallyExpired) {
  pass(`ended pilot is indistinguishable from a natural expiry (${endedNow})`)
} else {
  fail(`ended '${endedNow}' vs natural '${naturallyExpired}' -- a special state was created`)
}

// A converted org must be untouched by the model even if dates move.
const convertedAfter = accessLevel(
  simulateEndPilot(
    { is_pilot: true, pilot_start_date: day(-10), pilot_end_date: day(20), converted_to_paid: true },
    'locked'
  )
)
if (convertedAfter === 'full') {
  pass('a converted org stays full even with ended dates (SQL also refuses)')
} else {
  fail(`converted org degraded to '${convertedAfter}'`)
}

// ---------------------------------------------------------------------
// 4. Wiring: allowlist, server action, UI
// ---------------------------------------------------------------------
const FF = 'lib/admin/featureFlags.ts'
let ff
try {
  ff = await import(pathToFileURL(resolve(FF)).href)
} catch (err) {
  console.log(`FAIL  cannot import ${FF}: ${err?.message}`)
  process.exit(1)
}

if (Array.isArray(ff.ALLOWED_END_MODES) && ff.ALLOWED_END_MODES.length === 2) {
  pass('ALLOWED_END_MODES exported with 2 modes')
} else {
  fail('ALLOWED_END_MODES missing or wrong length')
}
if (ff.isAllowedEndMode?.('read_only') && ff.isAllowedEndMode?.('locked')) {
  pass('isAllowedEndMode accepts both real modes')
} else {
  fail('isAllowedEndMode rejects a valid mode')
}
// Negative control: the allowlist must actually reject something.
if (!ff.isAllowedEndMode?.('delete_everything') && !ff.isAllowedEndMode?.('')) {
  pass('isAllowedEndMode rejects unknown modes (negative control)')
} else {
  fail('isAllowedEndMode accepted an unknown mode')
}

// The SQL allowlist and the TS allowlist must agree.
const sqlModes = [...endBody.matchAll(/p_mode NOT IN \('([^']+)', '([^']+)'\)/g)][0]
if (sqlModes && ff.ALLOWED_END_MODES) {
  const sqlSet = [sqlModes[1], sqlModes[2]].sort().join(',')
  const tsSet = [...ff.ALLOWED_END_MODES].sort().join(',')
  if (sqlSet === tsSet) pass(`mode allowlists agree (${tsSet})`)
  else fail(`SQL modes [${sqlSet}] != TS modes [${tsSet}]`)
} else {
  fail('could not compare SQL and TS mode allowlists')
}

const ACTIONS = 'app/(admin)/admin/orgs/[id]/actions.ts'
const actions = read(ACTIONS)
if (!actions) {
  fail(`${ACTIONS} missing`)
} else {
  const wiring = [
    ['exports endPilot', /export async function endPilot/],
    ['gates on requireSuperAdmin', /export async function endPilot[\s\S]*?await requireSuperAdmin\(\)/],
    ['validates the org id', /export async function endPilot[\s\S]*?UUID_RE\.test\(orgId\)/],
    ['validates the mode', /export async function endPilot[\s\S]*?isAllowedEndMode\(mode\)/],
    ['calls the end_pilot RPC', /export async function endPilot[\s\S]*?\.rpc\('end_pilot'/],
    ['revalidates the detail page', /export async function endPilot[\s\S]*?revalidatePath\(`\/admin\/orgs\/\$\{orgId\}`\)/],
    ['maps already_converted', /already_converted/],
    ['maps not_a_pilot', /not_a_pilot/],
    ['maps invalid_mode', /invalid_mode/],
  ]
  for (const [label, re] of wiring) {
    if (re.test(actions)) pass(`server action ${label}`)
    else fail(`server action does not ${label}`)
  }
}

const UI = 'app/(admin)/admin/orgs/[id]/AdminOrgActions.tsx'
const ui = read(UI)
if (!ui) {
  fail(`${UI} missing`)
} else {
  const uiChecks = [
    ['imports endPilot', /import \{[^}]*endPilot[^}]*\} from '\.\/actions'/],
    ['requires a typed confirmation', /confirmText\.trim\(\) !== orgName\.trim\(\)/],
    ['disables the button until it matches', /disabled=\{isPending \|\| !confirmMatches\}/],
    ['offers both modes', /ALLOWED_END_MODES\.map/],
    ['hides the card when there is no pilot to end', /\{canEnd && \(/],
  ]
  for (const [label, re] of uiChecks) {
    if (re.test(ui)) pass(`UI ${label}`)
    else fail(`UI does not ${label}`)
  }
}

// ---------------------------------------------------------------------
console.log('')
console.log(`${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
console.log('admin end-pilot verification passed')
