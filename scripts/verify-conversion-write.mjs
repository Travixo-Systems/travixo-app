#!/usr/bin/env node
/**
 * verify-conversion-write.mjs
 *
 * Asserts the conversion write exists, is shared by both webhook paths, and is
 * idempotent by construction.
 *
 * Prints "conversion write verification passed" only when all hold.
 */

import { readFileSync, existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { resolve } from 'path'

let failures = 0, checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => { checks++; failures++; console.log(`FAIL  ${m}`); if (d) console.log(`      ${String(d).slice(0, 250)}`) }

const helperPath = 'lib/billing/mark-converted.ts'
if (!existsSync(helperPath)) { console.log(`FAIL  ${helperPath} missing`); process.exit(1) }
const helper = readFileSync(helperPath, 'utf8')

// --- the helper sets both fields the access model reads ----------
for (const field of ['converted_to_paid: true', 'is_pilot: false']) {
  if (helper.includes(field)) pass(`helper sets ${field}`)
  else fail(`helper does not set ${field}`)
}

// --- idempotent: no state guard on the update --------------------
// Strip comments first: the doc block deliberately names the guard it avoids,
// and matching that text would be a false positive.
const helperCode = helper
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter(l => !/^\s*(\*|\/\/)/.test(l))
  .join('\n')

if (/\.eq\(\s*['"]converted_to_paid['"]/.test(helperCode) || /\.is\(\s*['"]converted_to_paid['"]/.test(helperCode)) {
  fail('helper guards on current converted_to_paid -- a retry after a partial write would not complete')
} else {
  pass('helper writes absolute values with no state guard (safe under Stripe retries)')
}

// --- pilot dates preserved ---------------------------------------
if (/pilot_end_date\s*:/.test(helper) || /pilot_start_date\s*:/.test(helper)) {
  fail('helper overwrites pilot dates -- they are the historical record shown in admin')
} else {
  pass('helper leaves pilot_start_date / pilot_end_date intact')
}

// --- trialing counts as paying -----------------------------------
let mod
try { mod = await import(pathToFileURL(resolve(helperPath)).href) }
catch (err) { fail(`cannot import helper: ${err?.message}`) }

if (mod?.isPayingStatus) {
  const cases = [
    ['active', true], ['trialing', true], ['past_due', true],
    ['canceled', false], ['incomplete_expired', false], ['unpaid', false],
    [null, false], [undefined, false],
  ]
  let ok = true
  for (const [status, expected] of cases) {
    if (mod.isPayingStatus(status) !== expected) { ok = false; fail(`isPayingStatus(${status}) !== ${expected}`) }
  }
  if (ok) pass('isPayingStatus: active/trialing/past_due paying; cancelled and unknown not')

  // The one that matters commercially: Professional annual arrives as
  // 'trialing' because of the 90-day service-term trial.
  if (mod.isPayingStatus('trialing')) pass("'trialing' counts as paying (15-month Professional annual term)")
  else fail("'trialing' is not treated as paying -- Professional annual buyers would be locked out")
}

// --- both webhook paths call it ----------------------------------
const routePath = 'app/api/stripe/webhook/route.ts'
const route = readFileSync(routePath, 'utf8')

if (/from ['"]@\/lib\/billing\/mark-converted['"]/.test(route)) pass('webhook imports the shared helper')
else fail('webhook does not import lib/billing/mark-converted')

const calls = (route.match(/markOrganizationConverted\s*\(/g) || []).length
if (calls >= 2) pass(`markOrganizationConverted called ${calls} times (checkout + subscription paths)`)
else fail(`markOrganizationConverted called only ${calls} time(s) -- both paths must convert`)

// Locate the two handlers and assert each contains a call.
for (const [handler, marker] of [['checkout', 'handleCheckoutCompleted'], ['subscription', 'handleSubscriptionChange']]) {
  const start = route.indexOf(`async function ${marker}`)
  if (start === -1) { fail(`handler ${marker} not found`); continue }
  const next = route.indexOf('\nasync function ', start + 1)
  const body = route.slice(start, next === -1 ? undefined : next)
  if (/markOrganizationConverted\s*\(/.test(body)) pass(`${handler} handler converts the org`)
  else fail(`${handler} handler does not convert the org`)
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) { console.log(`\n${failures} check(s) failed.`); process.exit(1) }
console.log('\nconversion write verification passed')
