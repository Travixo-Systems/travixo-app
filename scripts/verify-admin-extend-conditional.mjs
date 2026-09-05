#!/usr/bin/env node
/**
 * verify-admin-extend-conditional.mjs
 *
 * Two related guarantees about the Extend control:
 *
 * 1. extend_trial no longer desyncs trial_ends_at from pilot_end_date.
 *    The Phase 2 version set `v_new_trial := v_old_trial` on the pilot
 *    branch, so extending a pilot left trial_ends_at behind. That column
 *    drives no access decision, but BOTH admin screens display it, so an
 *    admin read a stale date for every org they had extended.
 *
 * 2. The Extend control is offered only when extending can achieve
 *    something. accessLevel() returns 'locked' past PILOT_LOCKOUT_DAYS,
 *    and that test runs BEFORE pilot_end_date is read -- so extending a
 *    day-50 pilot writes a future date, reports success, and leaves the
 *    customer locked out. A locked pilot staying locked is CORRECT (day
 *    45 is a real deadline); offering a button that cannot deliver is not.
 *
 * Prints "admin extend conditional verification passed" only when every
 * case holds.
 */

import { pathToFileURL } from 'url'
import { readFileSync, existsSync, readdirSync } from 'fs'
const fs_readdir = d => { try { return readdirSync(d) } catch { return [] } }
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
// 1. The extend_trial date-sync fix
// ---------------------------------------------------------------------
// Located by glob, not a hardcoded name: the file was renamed to match the
// repo's yyyymmddHHMMSS convention and the old literal broke these checks.
const MIG_DIR = 'supabase/migrations'
const MIG_FILE = fs_readdir(MIG_DIR).find(f => f.endsWith('_admin_end_pilot.sql'))
const MIG = MIG_FILE
  ? `${MIG_DIR}/${MIG_FILE}`
  : `${MIG_DIR}/(no file matching *_admin_end_pilot.sql)`
const sql = read(MIG)
if (!sql) {
  console.log(`FAIL  ${MIG} missing`)
  process.exit(1)
}

const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.extend_trial')
const end = sql.indexOf('CREATE OR REPLACE FUNCTION public.end_pilot')
if (start < 0 || end < 0 || end < start) {
  console.log('FAIL  cannot isolate the extend_trial body in the migration')
  process.exit(1)
}
const extendBody = sql.slice(start, end)

// The pilot branch must now set trial_ends_at from the new pilot date.
if (/v_new_trial := v_new_pilot;/.test(extendBody)) {
  pass('extend_trial pilot branch sets trial_ends_at from the new pilot date')
} else {
  fail('extend_trial pilot branch does not sync trial_ends_at')
}

// And the UPDATE must actually write both columns.
if (/SET pilot_end_date = v_new_pilot,\s*\n\s*trial_ends_at\s*=\s*v_new_trial/.test(extendBody)) {
  pass('extend_trial UPDATE writes both date columns on the pilot branch')
} else {
  fail('extend_trial UPDATE does not write both date columns')
}

// Negative control: the OLD desyncing line must be gone from the pilot
// branch. Guard against a copy-paste that reintroduces it.
const pilotBranch = extendBody.slice(
  extendBody.indexOf('IF v_is_pilot THEN'),
  extendBody.indexOf('ELSE')
)
if (!/v_new_trial := v_old_trial/.test(pilotBranch)) {
  pass('the desyncing assignment is absent from the pilot branch (negative control)')
} else {
  fail('extend_trial still contains `v_new_trial := v_old_trial` on the pilot branch')
}

// The non-pilot branch SHOULD still leave pilot_end_date alone: a plain
// trial org has no pilot window. This asserts the fix was surgical.
const trialBranch = extendBody.slice(extendBody.indexOf('ELSE'))
if (/v_new_pilot := v_old_pilot;/.test(trialBranch)) {
  pass('non-pilot branch still leaves pilot_end_date untouched')
} else {
  fail('non-pilot branch unexpectedly changed')
}

// The never-shorten property must survive the edit.
if (/GREATEST\(now\(\), COALESCE\(v_old_pilot, now\(\)\)\)/.test(extendBody)) {
  pass('extend_trial still never shortens the pilot date')
} else {
  fail('extend_trial lost its never-shorten guard')
}

// ---------------------------------------------------------------------
// 2. canExtendPilot
// ---------------------------------------------------------------------
const OH = 'lib/admin/orgHealth.ts'
let oh
try {
  oh = await import(pathToFileURL(resolve(OH)).href)
} catch (err) {
  console.log(`FAIL  cannot import ${OH}: ${err?.message}`)
  process.exit(1)
}
const { canExtendPilot, extendUnavailableReason, canEndPilot } = oh

const AM = 'lib/billing/access-model.ts'
const am = await import(pathToFileURL(resolve(AM)).href)
const { accessLevel, PILOT_LOCKOUT_DAYS } = am

const day = n => new Date(Date.now() + n * 86400000).toISOString()

const extendCases = [
  // [label, org, expected canExtend]
  ['day 10 live pilot', { is_pilot: true, pilot_start_date: day(-10), pilot_end_date: day(20) }, true],
  ['day 29 live pilot', { is_pilot: true, pilot_start_date: day(-29), pilot_end_date: day(1) }, true],
  ['day 31 in grace', { is_pilot: true, pilot_start_date: day(-31), pilot_end_date: day(-1) }, true],
  ['day 44 last grace day', { is_pilot: true, pilot_start_date: day(-44), pilot_end_date: day(-14) }, true],
  ['day 50 past lockout', { is_pilot: true, pilot_start_date: day(-50), pilot_end_date: day(-20) }, false],
  ['day 90 long locked', { is_pilot: true, pilot_start_date: day(-90), pilot_end_date: day(-60) }, false],
  ['converted org', { is_pilot: true, pilot_start_date: day(-10), pilot_end_date: day(20), converted_to_paid: true }, false],
  ['converted past lockout', { is_pilot: true, pilot_start_date: day(-90), pilot_end_date: day(-60), converted_to_paid: true }, false],
  ['never a pilot', { is_pilot: false }, false],
]

for (const [label, org, expected] of extendCases) {
  const got = canExtendPilot(org)
  if (got === expected) pass(`canExtendPilot: ${label} -> ${got}`)
  else fail(`canExtendPilot: ${label} -> ${got}, expected ${expected}`)
}

// The core invariant: canExtendPilot must be false for exactly the orgs
// accessLevel() calls 'locked'. Measured, not assumed.
let mismatches = 0
for (let d = 1; d <= 120; d++) {
  const org = {
    is_pilot: true,
    pilot_start_date: day(-d),
    pilot_end_date: day(30 - d),
  }
  const locked = accessLevel(org) === 'locked'
  // Extending must be available exactly when the org is NOT locked.
  if (canExtendPilot(org) !== !locked) mismatches++
}
if (mismatches === 0) {
  pass('canExtendPilot is false for exactly the locked orgs across 120 days')
} else {
  fail(`canExtendPilot disagreed with accessLevel on ${mismatches}/120 days`)
}

// A reason must be present whenever the control is hidden, and absent
// when it is available -- otherwise the UI shows an empty warning.
let reasonBad = 0
for (const [label, org] of extendCases.map(c => [c[0], c[1]])) {
  const allowed = canExtendPilot(org)
  const reason = extendUnavailableReason(org)
  if (allowed && reason !== null) { reasonBad++; fail(`reason present while extending is allowed: ${label}`) }
  if (!allowed && (!reason || reason.length < 10)) { reasonBad++; fail(`no usable reason while blocked: ${label}`) }
}
if (reasonBad === 0) pass('extendUnavailableReason is present exactly when blocked')

// The lockout reason should name the real constant, so the admin reads a
// number that matches the product.
const lockedReason = extendUnavailableReason({
  is_pilot: true,
  pilot_start_date: day(-50),
  pilot_end_date: day(-20),
})
if (lockedReason && lockedReason.includes(String(PILOT_LOCKOUT_DAYS))) {
  pass(`lockout reason cites PILOT_LOCKOUT_DAYS (${PILOT_LOCKOUT_DAYS})`)
} else {
  fail('lockout reason does not cite the real lockout constant', lockedReason)
}

// ---------------------------------------------------------------------
// 3. canEndPilot
// ---------------------------------------------------------------------
const endCases = [
  ['day 10 live pilot', { is_pilot: true, pilot_start_date: day(-10), pilot_end_date: day(20) }, true],
  ['day 31 in grace', { is_pilot: true, pilot_start_date: day(-31), pilot_end_date: day(-1) }, true],
  ['day 50 already locked', { is_pilot: true, pilot_start_date: day(-50), pilot_end_date: day(-20) }, false],
  ['converted org', { is_pilot: true, pilot_start_date: day(-10), pilot_end_date: day(20), converted_to_paid: true }, false],
  ['never a pilot', { is_pilot: false }, false],
]
for (const [label, org, expected] of endCases) {
  const got = canEndPilot(org)
  if (got === expected) pass(`canEndPilot: ${label} -> ${got}`)
  else fail(`canEndPilot: ${label} -> ${got}, expected ${expected}`)
}

// ---------------------------------------------------------------------
// 4. The UI actually consumes the gate
// ---------------------------------------------------------------------
const UI = 'app/(admin)/admin/orgs/[id]/AdminOrgActions.tsx'
const ui = read(UI)
if (!ui) {
  fail(`${UI} missing`)
} else {
  const uiChecks = [
    ['accepts a canExtend prop', /canExtend: boolean/],
    ['disables the Extend button', /disabled=\{isPending \|\| !canExtend\}/],
    ['disables the day dropdown too', /disabled=\{isPending \|\| !canExtend\}[\s\S]*?ALLOWED_EXTEND_DAYS\.map/],
    ['guards the handler as well as the button', /function runExtend\(\)[\s\S]*?if \(!canExtend\) return/],
    ['renders the reason', /extendReason/],
  ]
  for (const [label, re] of uiChecks) {
    if (re.test(ui)) pass(`UI ${label}`)
    else fail(`UI does not ${label}`)
  }
}

const PAGE = 'app/(admin)/admin/orgs/[id]/page.tsx'
const page = read(PAGE)
if (!page) {
  fail(`${PAGE} missing`)
} else {
  const pageChecks = [
    ['computes canExtendPilot', /canExtendPilot\(o\)/],
    ['computes the reason', /extendUnavailableReason\(o\)/],
    ['computes canEndPilot', /canEndPilot\(o\)/],
    ['passes all three to the client island', /canExtend=\{extendAllowed\}[\s\S]*?extendReason=\{extendReason\}[\s\S]*?canEnd=\{endAllowed\}/],
    ['selects pilot_start_date (needed by the gate)', /pilot_start_date/],
  ]
  for (const [label, re] of pageChecks) {
    if (re.test(page)) pass(`page ${label}`)
    else fail(`page does not ${label}`)
  }
}

// ---------------------------------------------------------------------
console.log('')
console.log(`${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
console.log('admin extend conditional verification passed')
