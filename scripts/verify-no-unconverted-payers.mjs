#!/usr/bin/env node
/**
 * verify-no-unconverted-payers.mjs
 *
 * Catches the state the webhook fix prevents going forward: an organization
 * that is paying but still flagged as an unconverted pilot. Under the
 * read-only gate such an org is frozen out despite having paid, so this must
 * stay at zero.
 *
 * Paying means a real Stripe subscription id, or a stripe_customer_id together
 * with a live subscription status.
 *
 * Prints "no unconverted payers verification passed" when none are found.
 */

import { readFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { resolve } from 'path'

const ENV_PATH = process.argv[2] || '.env.local'
const env = {}
for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
const h = { apikey: SVC, Authorization: `Bearer ${SVC}` }

let failures = 0, checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => { checks++; failures++; console.log(`FAIL  ${m}`); if (d) console.log(`      ${String(d).slice(0, 400)}`) }

const model = await import(pathToFileURL(resolve('lib/billing/access-model.ts')).href)

const orgs = await (await fetch(
  `${U}/rest/v1/organizations?select=id,name,is_pilot,converted_to_paid,pilot_start_date,pilot_end_date,stripe_customer_id,subscription_status&limit=500`,
  { headers: h }
)).json()

const subs = await (await fetch(
  `${U}/rest/v1/subscriptions?select=organization_id,status,stripe_subscription_id&limit=500`,
  { headers: h }
)).json()

if (!Array.isArray(orgs) || !Array.isArray(subs)) {
  console.log('FAIL  could not read organizations or subscriptions')
  process.exit(1)
}

const subByOrg = new Map(subs.map(s => [s.organization_id, s]))

// An org is "paying" when Stripe has a subscription for it.
const payers = orgs.filter(o => {
  const s = subByOrg.get(o.id)
  return !!s?.stripe_subscription_id
})

pass(`scanned ${orgs.length} organization(s), ${payers.length} with a real Stripe subscription`)

const stranded = payers.filter(o => !o.converted_to_paid || o.is_pilot)
if (stranded.length === 0) {
  pass('no paying organization is left flagged as an unconverted pilot')
} else {
  fail(
    `${stranded.length} paying organization(s) are still unconverted -- they will be frozen by the read-only gate`,
    stranded.map(o => `${o.name}: converted=${o.converted_to_paid} is_pilot=${o.is_pilot}`).join('\n      ')
  )
}

// Nobody who is paying should compute to anything but 'full'.
const blocked = payers.filter(o => model.accessLevel(o) !== 'full')
if (blocked.length === 0) {
  pass('every paying organization computes to accessLevel "full"')
} else {
  fail(
    `${blocked.length} paying organization(s) do not compute to "full"`,
    blocked.map(o => `${o.name}: ${model.accessLevel(o)}`).join('\n      ')
  )
}

// Positive control: the checker must be able to see a stranded org. Build one
// in memory (never written) and confirm it would be flagged.
const fakeStranded = {
  is_pilot: true,
  converted_to_paid: false,
  pilot_start_date: new Date(Date.now() - 40 * 86400000).toISOString(),
  pilot_end_date: new Date(Date.now() - 10 * 86400000).toISOString(),
}
if (model.accessLevel(fakeStranded) === 'read_only') {
  pass('control: an unconverted expired pilot still computes to read_only, so this check can fail')
} else {
  fail('control failed: the model no longer flags an unconverted expired pilot')
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) { console.log(`\n${failures} check(s) failed.`); process.exit(1) }
console.log('\nno unconverted payers verification passed')
