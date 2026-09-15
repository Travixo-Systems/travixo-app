#!/usr/bin/env node
/**
 * verify-access-model.mjs
 *
 * Exercises lib/billing/access-model.ts across the pilot lifecycle, and
 * asserts the trial-vs-pilot distinction is documented where a future reader
 * will find it.
 *
 * Prints "access model verification passed" only when every case holds.
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

const src = 'lib/billing/access-model.ts'
if (!existsSync(src)) { console.log(`FAIL  ${src} missing`); process.exit(1) }

let m
try { m = await import(pathToFileURL(resolve(src)).href) }
catch (err) { console.log(`FAIL  cannot import ${src}: ${err?.message}`); process.exit(1) }

const { accessLevel, canWrite, canRead, PILOT_FULL_DAYS, PILOT_GRACE_DAYS, PILOT_LOCKOUT_DAYS } = m

// The clock is read ONCE, here, and every fixture is derived from this single
// instant.
//
// WHY THIS MATTERS -- it broke the deploy
//
// day() used to call Date.now() per fixture, and daysSincePilotStart() then
// calls it again when the assertion runs. Two instants, microseconds apart.
// daysSincePilotStart does Math.ceil((now - started) / 86400000), so a
// day(-45) fixture measured 1ms later ceils to 46, not 45 -- tipping the
// `> PILOT_LOCKOUT_DAYS` comparison and returning 'locked' where the case
// expects 'read_only'. Measured: 8 passes and 2 failures in 10 consecutive
// runs. prebuild runs verify:static, so that landed on the deploy path and
// failed production builds at random.
//
// Freezing NOW removes the second instant. The half-day offsets below remove
// the boundary sensitivity as well, so neither alone is load-bearing.
const NOW = Date.now()
const day = n => new Date(NOW + n * 86400000).toISOString()

// --- constants ---------------------------------------------------
if (PILOT_FULL_DAYS === 30) pass('PILOT_FULL_DAYS = 30')
else fail(`PILOT_FULL_DAYS = ${PILOT_FULL_DAYS}, expected 30`)
if (PILOT_GRACE_DAYS === 15) pass('PILOT_GRACE_DAYS = 15')
else fail(`PILOT_GRACE_DAYS = ${PILOT_GRACE_DAYS}, expected 15`)
if (PILOT_LOCKOUT_DAYS === 45) pass('PILOT_LOCKOUT_DAYS = 45 (derived)')
else fail(`PILOT_LOCKOUT_DAYS = ${PILOT_LOCKOUT_DAYS}, expected 45`)

// --- the lifecycle -----------------------------------------------
const cases = [
  ['day 10, pilot running',   { is_pilot: true, pilot_start_date: day(-10), pilot_end_date: day(20) },  'full'],
  // The three cases below sit ON a decision boundary, so their offsets carry a
  // half-day bias: day(-29) measures as EXACTLY 29 days only if no time passes
  // between building the fixture and asserting on it, and ceils to 30 if any
  // does. -28.5 measures 29 whatever happens. Same for 31 (-30.5) and 45
  // (-44.5). The bias moves the fixture, never the boundary: PILOT_FULL_DAYS
  // and PILOT_LOCKOUT_DAYS are asserted unchanged above, and
  // daysSincePilotStart is untouched -- moving it would shift the real
  // lockout date for live organizations.
  ['day 29, about to end',    { is_pilot: true, pilot_start_date: day(-28.5), pilot_end_date: day(1) },   'full'],
  ['day 31, just expired',    { is_pilot: true, pilot_start_date: day(-30.5), pilot_end_date: day(-1) },  'read_only'],
  ['day 40, mid grace',       { is_pilot: true, pilot_start_date: day(-40), pilot_end_date: day(-10) }, 'read_only'],
  ['day 45, last grace day',  { is_pilot: true, pilot_start_date: day(-44.5), pilot_end_date: day(-15) }, 'read_only'],
  ['day 60, past lockout',    { is_pilot: true, pilot_start_date: day(-60), pilot_end_date: day(-30) }, 'locked'],
  ['converted mid-grace',     { is_pilot: true, pilot_start_date: day(-40), pilot_end_date: day(-10), converted_to_paid: true }, 'full'],
  ['converted post-lockout',  { is_pilot: true, pilot_start_date: day(-90), pilot_end_date: day(-60), converted_to_paid: true }, 'full'],
  // is_pilot: false is NOT evidence of payment. An org whose pilot was ended
  // administratively lands here, and used to compute as a paying customer
  // forever -- three live orgs were in that state with no write gate and no
  // asset ceiling. Payment now has to be shown.
  ['never a pilot, no subscription', { is_pilot: false }, 'read_only'],
  ['non-pilot with a licence',       { is_pilot: false, licensed_capacity: 250 }, 'full'],
  ['non-pilot, converted',           { is_pilot: false, converted_to_paid: true }, 'full'],
  ['expired pilot with a licence',   { is_pilot: true, pilot_start_date: day(-40), pilot_end_date: day(-10), licensed_capacity: 100 }, 'full'],
  ['expired pilot, licence removed', { is_pilot: true, pilot_start_date: day(-40), pilot_end_date: day(-10), licensed_capacity: null }, 'read_only'],
  ['unbounded pilot',         { is_pilot: true, pilot_start_date: day(-500), pilot_end_date: null }, 'full'],
]

for (const [label, org, expected] of cases) {
  const got = accessLevel(org)
  if (got === expected) pass(`${label} -> ${got}`)
  else fail(`${label} -> ${got}, expected ${expected}`)
}

// --- canWrite / canRead agree with the level ---------------------
const expired = { is_pilot: true, pilot_start_date: day(-40), pilot_end_date: day(-10) }
const locked = { is_pilot: true, pilot_start_date: day(-60), pilot_end_date: day(-30) }
const active = { is_pilot: true, pilot_start_date: day(-5), pilot_end_date: day(25) }

if (canWrite(active) && !canWrite(expired) && !canWrite(locked)) {
  pass('canWrite: true only during the full window')
} else fail('canWrite disagrees with accessLevel')

if (canRead(active) && canRead(expired) && !canRead(locked)) {
  pass('canRead: true through the grace window, false once locked')
} else fail('canRead disagrees with accessLevel')

// The whole point of the change: read-only is site-wide, so a write is
// refused regardless of which feature it touches. Assert the model exposes no
// feature-specific escape hatch.
const text = readFileSync(src, 'utf8')
if (!/vgp/i.test(text.replace(/^\s*\*.*$/gm, ''))) {
  pass('the model has no VGP-specific branch (read-only is site-wide)')
} else {
  fail('the model references VGP outside comments -- read-only is not site-wide')
}

// --- the vocabulary is documented --------------------------------
for (const needle of ['TRIAL vs PILOT', 'trial_ends_at', 'subscription_tier', 'has_feature_access']) {
  if (text.includes(needle)) pass(`documents "${needle}"`)
  else fail(`the trial/pilot note does not mention "${needle}"`)
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) { console.log(`\n${failures} check(s) failed.`); process.exit(1) }
console.log('\naccess model verification passed')
