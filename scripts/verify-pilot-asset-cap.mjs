#!/usr/bin/env node
/**
 * verify-pilot-asset-cap.mjs
 *
 * The pilot cap was 50 — lower than every plan sold, so a prospect evaluated
 * the product under its most restrictive form and a depot with 200 machines
 * would conclude it did not fit. This asserts the cap is a single shared
 * constant, is generous enough that evaluation is not the constraint, and
 * still leaves headroom to gain by converting.
 *
 * Prints "pilot asset cap verification passed" when all hold.
 */

import { readFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { resolve } from 'path'

let failures = 0, checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => { checks++; failures++; console.log(`FAIL  ${m}`); if (d) console.log(`      ${String(d).slice(0, 300)}`) }

const mod = await import(pathToFileURL(resolve('lib/billing/access-model.ts')).href)
const CAP = mod.PILOT_MAX_ASSETS

if (typeof CAP === 'number') pass(`PILOT_MAX_ASSETS is exported (${CAP})`)
else { console.log('FAIL  PILOT_MAX_ASSETS is not exported'); process.exit(1) }

// --- the cap must not be the old restrictive value ---------------
if (CAP > 100) pass(`cap ${CAP} exceeds the smallest plan (Starter, 100) -- evaluation is not the constraint`)
else fail(`cap ${CAP} is at or below Starter's 100, reproducing the original problem`)

// --- live plans: converting must still gain something ------------
const env = {}
try {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
} catch {}

if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  const plans = await (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/subscription_plans?select=slug,max_assets`, { headers: h })).json()
  if (Array.isArray(plans) && plans.length) {
    const higher = plans.filter(p => p.max_assets > CAP).map(p => p.slug)
    if (higher.length > 0) pass(`converting still gains headroom on: ${higher.join(', ')}`)
    else fail('no plan offers more assets than the pilot -- converting would be a downgrade')

    const below = plans.filter(p => p.max_assets < CAP).map(p => `${p.slug}(${p.max_assets})`)
    if (below.length > 0) {
      // Not a failure: a plan smaller than the pilot is a pricing choice. Say
      // it plainly so it is a decision rather than a surprise.
      console.log(`NOTE  plan(s) smaller than the pilot cap: ${below.join(', ')} -- converting there reduces capacity`)
    }
  } else {
    fail('could not read subscription_plans')
  }
} else {
  fail('no supabase credentials -- cannot check the cap against live plans')
}

// --- no site hardcodes the old value -----------------------------
const files = [
  'lib/billing/entitlements.ts',
  'app/api/subscriptions/route.ts',
  'components/dashboard/PilotBanner.tsx',
]
const offenders = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  if (/\?\s*50\s*:/.test(src) || /\/50 équipements/.test(src) || /50 équipements max/.test(src)) offenders.push(f)
  if (!/PILOT_MAX_ASSETS/.test(src)) offenders.push(`${f} (does not use the constant)`)
}
if (offenders.length === 0) pass(`all ${files.length} sites read the shared constant`)
else fail('sites still hardcode the cap', offenders.join(', '))

// --- the user-facing copy matches the constant -------------------
const i18n = readFileSync('lib/i18n.ts', 'utf8')
const m = i18n.match(/(\d+) équipements max • Conformité VGP incluse/)
if (!m) fail('the signup/i18n asset-cap line was not found')
else if (Number(m[1]) === CAP) pass(`i18n copy says ${m[1]}, matching the constant`)
else fail(`i18n copy says ${m[1]} but the constant is ${CAP}`)

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) { console.log(`\n${failures} check(s) failed.`); process.exit(1) }
console.log('\npilot asset cap verification passed')
