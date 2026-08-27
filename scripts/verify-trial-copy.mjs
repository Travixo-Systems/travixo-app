#!/usr/bin/env node
/**
 * verify-trial-copy.mjs
 *
 * Asserts no user-facing copy still advertises a 15-day trial, in English or
 * French, and that the 30-day claim is actually present in both languages.
 *
 * Deliberately does NOT flag `vgpTiming15` ("15 days before"), which is a VGP
 * inspection alert lead time and has nothing to do with the trial.
 *
 * Prints "trial copy verification passed" only when all assertions hold.
 */

import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 400)}`)
}

// Words that mean "trial" near a "15", in either language.
const TRIAL_WORD = /(trial|pilot|pilote|essai|évaluation|evaluation)/i
const FIFTEEN = /15[-\s]?(day|days|jour|jours)/i

// Files whose user-facing copy matters.
let files = []
try {
  files = execFileSync(
    'git',
    ['ls-files', 'app', 'components', 'lib'],
    { encoding: 'utf8' }
  )
    .split('\n')
    .filter(f => /\.(ts|tsx)$/.test(f))
} catch (err) {
  fail(`could not list files: ${err?.message}`)
}

const offenders = []

for (const file of files) {
  let src
  try { src = readFileSync(file, 'utf8') } catch { continue }

  src.split('\n').forEach((line, i) => {
    if (!FIFTEEN.test(line)) return
    if (!TRIAL_WORD.test(line)) return          // e.g. "15 days before" (VGP)
    offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 110)}`)
  })
}

if (offenders.length === 0) {
  pass('no user-facing copy advertises a 15-day trial')
} else {
  fail(`${offenders.length} line(s) still advertise a 15-day trial`, offenders.join('\n      '))
}

// --- the 30-day claim must actually be present ------------------
// A pure absence check would pass if someone deleted the copy entirely, so
// assert the replacement exists in both languages.
let i18n = ''
try { i18n = readFileSync('lib/i18n.ts', 'utf8') } catch {}

const en30 = (i18n.match(/30-day (trial|pilot)/gi) || []).length
const fr30 = (i18n.match(/30 jours/gi) || []).length

if (en30 > 0) pass(`i18n carries ${en30} English "30-day" trial string(s)`)
else fail('i18n has no English "30-day trial/pilot" copy')

if (fr30 > 0) pass(`i18n carries ${fr30} French "30 jours" string(s)`)
else fail('i18n has no French "30 jours" copy')

// --- control: the VGP lead-time string must survive -------------
// Proves the sweep was targeted rather than a blanket 15->30 replace.
if (/vgpTiming15/.test(i18n) && /15 jours avant|15 days before/.test(i18n)) {
  pass('vgpTiming15 ("15 days before") left intact -- sweep was targeted')
} else {
  fail('vgpTiming15 was altered -- an unrelated VGP alert string got caught')
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\ntrial copy verification passed')
