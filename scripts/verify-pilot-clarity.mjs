#!/usr/bin/env node
/**
 * verify-pilot-clarity.mjs
 *
 * Asserts the billing page warns a pilot about what a plan does NOT include,
 * using each plan's real feature data rather than a hardcoded plan name, and
 * that every warned feature has a label in both languages.
 *
 * Prints "pilot clarity verification passed" and, separately,
 * "driven by plan features" when all hold.
 */

import { readFileSync, existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { resolve } from 'path'

let failures = 0, checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => { checks++; failures++; console.log(`FAIL  ${m}`); if (d) console.log(`      ${String(d).slice(0, 300)}`) }

const modPath = 'lib/billing/pilot-vs-plan.ts'
if (!existsSync(modPath)) { console.log(`FAIL  ${modPath} missing`); process.exit(1) }

let mod
try { mod = await import(pathToFileURL(resolve(modPath)).href) }
catch (err) { console.log(`FAIL  cannot import: ${err?.message}`); process.exit(1) }

const { featuresLostOnPlan, planRemovesPilotFeatures } = mod

// --- the case this exists for ------------------------------------
const starter = { slug: 'starter', features: {
  qr_tracking: true, excel_import: true, email_support: true,
  basic_reporting: true, public_scanning: true,
} }
const professional = { slug: 'professional', features: {
  qr_tracking: true, excel_import: true, multi_location: true, vgp_compliance: true,
  basic_reporting: true, public_scanning: true, priority_support: true,
  vgp_email_alerts: true, rental_management: true,
} }

const lost = featuresLostOnPlan(starter)
if (lost.includes('vgp_compliance')) {
  pass(`Starter is flagged as missing vgp_compliance (${lost.length} material feature(s) lost)`)
} else {
  fail('Starter is not flagged as missing vgp_compliance -- the warning would never appear')
}

if (lost.includes('rental_management')) pass('Starter is flagged as missing rental_management')
else fail('Starter is not flagged as missing rental_management')

// --- a plan that covers everything material warns about less -----
const proLost = featuresLostOnPlan(professional)
if (!proLost.includes('vgp_compliance') && !proLost.includes('rental_management')) {
  pass('Professional is not flagged for vgp_compliance or rental_management')
} else {
  fail(`Professional wrongly flagged: ${proLost.join(', ')}`)
}

// --- only shown to a pilot ---------------------------------------
if (planRemovesPilotFeatures(starter, true)) pass('the warning applies while the org is a pilot')
else fail('the warning does not apply to a pilot')

if (!planRemovesPilotFeatures(starter, false)) pass('the warning is suppressed once the org is not a pilot')
else fail('the warning would show to a non-pilot -- it would read as a downgrade notice')

// --- driven by data, not a hardcoded slug ------------------------
const src = readFileSync(modPath, 'utf8')
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\*|\/\/)/.test(l)).join('\n')
if (/['"]starter['"]/.test(code)) {
  fail('the module hardcodes the starter slug -- adding VGP to Starter would leave a stale warning')
} else {
  pass('the module never branches on a plan slug')
}

// Prove it: a Starter that DID include VGP must stop being flagged for it.
const starterWithVgp = { slug: 'starter', features: { ...starter.features, vgp_compliance: true } }
if (!featuresLostOnPlan(starterWithVgp).includes('vgp_compliance')) {
  pass('control: granting VGP to Starter removes it from the warning automatically')
} else {
  fail('control failed: the warning ignores the plan feature data')
}

// --- the page renders it -----------------------------------------
const pagePath = 'app/(dashboard)/settings/subscription/page.tsx'
const page = readFileSync(pagePath, 'utf8')
if (/planRemovesPilotFeatures\s*\(/.test(page) && /featuresLostOnPlan\s*\(/.test(page)) {
  pass('the subscription page renders the warning from the shared helper')
} else {
  fail('the subscription page does not use the helper')
}

// --- every warned feature has a bilingual label ------------------
const i18n = readFileSync('lib/i18n.ts', 'utf8')
const missing = []
for (const key of featuresLostOnPlan(starter)) {
  const idx = i18n.indexOf(`      ${key}: {`)
  if (idx === -1) { missing.push(key); continue }
  const block = i18n.slice(idx, idx + 200)
  if (!/en:\s*["']/.test(block) || !/fr:\s*["']/.test(block)) missing.push(key)
}
if (missing.length === 0) pass('every warned feature has an English and French label')
else fail(`missing or incomplete labels: ${missing.join(', ')}`)

// --- the warning copy exists in both languages -------------------
for (const key of ['pilotVsPlanTitle', 'pilotVsPlanNote']) {
  const idx = i18n.indexOf(`    ${key}: {`)
  if (idx === -1) { fail(`i18n key ${key} missing`); continue }
  const block = i18n.slice(idx, idx + 260)
  if (/en:\s*["']/.test(block) && /fr:\s*["']/.test(block)) pass(`${key} present in both languages`)
  else fail(`${key} is not bilingual`)
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) { console.log(`\n${failures} check(s) failed.`); process.exit(1) }
console.log('\npilot clarity verification passed')
console.log('driven by plan features')
