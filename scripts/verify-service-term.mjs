#!/usr/bin/env node
/**
 * verify-service-term.mjs
 *
 * Asserts the annual bonus term is declared once and behaves correctly:
 * Professional annual = 15 months, everything else unchanged.
 *
 * Exercises the real module rather than pattern-matching source, so a change
 * that keeps the text but breaks the logic still fails.
 *
 * Prints "service term verification passed" only when every case holds.
 */

import { pathToFileURL } from 'url'
import { existsSync } from 'fs'
import { resolve } from 'path'

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 200)}`)
}

const src = 'lib/billing/service-term.ts'
if (!existsSync(src)) {
  console.log(`FAIL  ${src} does not exist`)
  process.exit(1)
}

// The module is TypeScript; import it through Node's type stripping.
let mod
try {
  mod = await import(pathToFileURL(resolve(src)).href)
} catch (err) {
  console.log(`FAIL  could not import ${src}: ${err?.message}`)
  process.exit(1)
}

const { bonusMonths, serviceMonths, trialPeriodDays, hasBonusTerm, BASE_ANNUAL_MONTHS } = mod

// --- the advertised figure ---------------------------------------
if (BASE_ANNUAL_MONTHS === 12) pass('BASE_ANNUAL_MONTHS = 12')
else fail(`BASE_ANNUAL_MONTHS is ${BASE_ANNUAL_MONTHS}, expected 12`)

// --- Professional annual is the only plan with a bonus -----------
const cases = [
  // plan,          cycle,     bonus, service, trialDays
  ['professional', 'yearly',   3,     15,      90],
  ['professional', 'monthly',  0,     1,       undefined],
  ['starter',      'yearly',   0,     12,      undefined],
  ['starter',      'monthly',  0,     1,       undefined],
  ['business',     'yearly',   0,     12,      undefined],
  ['business',     'monthly',  0,     1,       undefined],
  ['enterprise',   'yearly',   0,     12,      undefined],
]

for (const [plan, cycle, bonus, service, trial] of cases) {
  const b = bonusMonths(plan, cycle)
  const s = serviceMonths(plan, cycle)
  const t = trialPeriodDays(plan, cycle)
  const ok = b === bonus && s === service && t === trial
  if (ok) {
    pass(`${plan}/${cycle}: bonus=${b} service=${s} trial=${t ?? 'none'}`)
  } else {
    fail(
      `${plan}/${cycle} wrong`,
      `got bonus=${b} service=${s} trial=${t}; expected bonus=${bonus} service=${service} trial=${trial}`
    )
  }
}

// --- the headline claim, stated directly -------------------------
if (serviceMonths('professional', 'yearly') === 15) {
  pass('Professional annual grants 15 months of service (the advertised term)')
} else {
  fail(`Professional annual grants ${serviceMonths('professional', 'yearly')} months, site says 15`)
}

// --- an unknown plan must not inherit a discount -----------------
if (bonusMonths('some_future_plan', 'yearly') === 0) {
  pass('an unlisted plan inherits no bonus')
} else {
  fail('an unlisted plan inherited a bonus -- discounts could leak to new plans')
}

// --- trial_period_days: 0 must never be produced -----------------
// Stripe rejects a zero trial, so the helper must return undefined instead.
const zeros = cases
  .filter(([p, c]) => trialPeriodDays(p, c) === 0)
  .map(([p, c]) => `${p}/${c}`)
if (zeros.length === 0) pass('never returns trial_period_days: 0 (Stripe rejects it)')
else fail(`returns 0 for: ${zeros.join(', ')}`)

// --- hasBonusTerm agrees with bonusMonths ------------------------
if (hasBonusTerm('professional', 'yearly') && !hasBonusTerm('professional', 'monthly')) {
  pass('hasBonusTerm is true only for Professional annual')
} else {
  fail('hasBonusTerm disagrees with bonusMonths')
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nservice term verification passed')
