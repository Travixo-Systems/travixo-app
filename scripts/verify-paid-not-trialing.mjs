#!/usr/bin/env node
/**
 * verify-paid-not-trialing.mjs
 *
 * Asserts a paid subscription is never recorded or surfaced as a trial.
 *
 * Stripe reports `trialing` for the 90-day deferral that delivers the
 * 15-month Professional annual term, so a customer who paid €14 400 arrives
 * with that status. Storing it verbatim told them they were on an "Essai"
 * ending in 90 days.
 *
 * Prints "paid status verification passed" only when all cases hold.
 */

import { readFileSync, existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { resolve } from 'path'

let failures = 0, checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => { checks++; failures++; console.log(`FAIL  ${m}`); if (d) console.log(`      ${String(d).slice(0, 250)}`) }

const helperPath = 'lib/billing/mark-converted.ts'
if (!existsSync(helperPath)) { console.log(`FAIL  ${helperPath} missing`); process.exit(1) }

let mod
try { mod = await import(pathToFileURL(resolve(helperPath)).href) }
catch (err) { console.log(`FAIL  cannot import helper: ${err?.message}`); process.exit(1) }

const { billingStatusFromStripe } = mod
if (typeof billingStatusFromStripe !== 'function') {
  console.log('FAIL  billingStatusFromStripe is not exported'); process.exit(1)
}

// --- the case this exists for -----------------------------------
if (billingStatusFromStripe('trialing', true) === 'active') {
  pass('a PAID trialing subscription is recorded as active (not a trial)')
} else {
  fail(`paid trialing -> ${billingStatusFromStripe('trialing', true)}, expected active`)
}

// --- everything else is unchanged --------------------------------
const cases = [
  ['active', true, 'active'],
  ['active', false, 'active'],
  ['past_due', true, 'past_due'],
  ['canceled', true, 'cancelled'],
  ['unpaid', true, 'past_due'],
  ['incomplete_expired', true, 'expired'],
  ['paused', true, 'cancelled'],
  // Unpaid trialing keeps its meaning: nothing in our product creates such a
  // subscription today, but the mapping must not lie if one appears.
  ['trialing', false, 'trialing'],
  ['incomplete', false, 'trialing'],
]
let ok = true
for (const [status, paid, expected] of cases) {
  const got = billingStatusFromStripe(status, paid)
  if (got !== expected) { ok = false; fail(`billingStatusFromStripe('${status}', ${paid}) -> ${got}, expected ${expected}`) }
}
if (ok) pass(`${cases.length} other status mappings unchanged`)

// An unknown status must not silently become a trial.
if (billingStatusFromStripe('some_new_stripe_status', true) !== 'trialing') {
  pass('an unknown Stripe status never maps to trialing')
} else {
  fail('an unknown Stripe status mapped to trialing')
}

// --- the webhook uses it ----------------------------------------
const route = readFileSync('app/api/stripe/webhook/route.ts', 'utf8')
if (/billingStatusFromStripe\s*\(/.test(route)) pass('webhook uses billingStatusFromStripe')
else fail('webhook does not call billingStatusFromStripe')

// The old inline map must be gone, or it would silently win.
if (/const\s+statusMap\s*:\s*Record/.test(route)) {
  fail('the old inline statusMap is still present in the webhook')
} else {
  pass('the old inline statusMap has been removed')
}

// --- is_trial in the API is defended too -------------------------
const subsRoute = readFileSync('app/api/subscriptions/route.ts', 'utf8')
const isTrialLine = subsRoute.slice(subsRoute.indexOf('is_trial:'), subsRoute.indexOf('is_trial:') + 260)
if (/converted_to_paid/.test(isTrialLine) && /stripe_subscription_id/.test(isTrialLine)) {
  pass('is_trial requires no payment and no Stripe subscription')
} else {
  fail('is_trial is still a bare status check -- a paid customer could surface as a trial', isTrialLine.split('\n')[0])
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) { console.log(`\n${failures} check(s) failed.`); process.exit(1) }
console.log('\npaid status verification passed')
