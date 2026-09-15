#!/usr/bin/env node
/**
 * verify-log.mjs
 *
 * Records WHEN each verification script last actually ran, and fails when a
 * record is too old or missing.
 *
 * ---------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------
 * verify-readonly-enforcement.mjs was broken for three weeks. Not because
 * anyone ignored a red gate -- because nobody ran it, so there was no red gate
 * to ignore. Its ledger entry still said PASS, with evidence from the last
 * time a human remembered. A gate that runs only when someone remembers
 * reports stale truth, and stale truth is worse than a known gap: it is a
 * green tick standing in for a measurement nobody made.
 *
 * So the freshness of a result is itself something to verify. This module is
 * the record, and `--check` is the tripwire.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS RECORDED
 * ---------------------------------------------------------------------------
 * One line per run, appended by the script itself on exit, in a TRACKED file
 * (.verify-log.json) so the record is shared rather than local. Each entry:
 * script name, ISO timestamp, outcome, and the check tally. Nothing is
 * hand-written; a date a human types rots exactly the way the gate did.
 *
 * Usage:
 *   node scripts/verify-log.mjs --record <name> <pass|fail> [detail]
 *   node scripts/verify-log.mjs --check [--max-age-days N]
 *   node scripts/verify-log.mjs --report
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const LOG = '.verify-log.json'

/**
 * Scripts that need a live dev server and a database, so they CANNOT run in a
 * build hook: they would break deploys for environmental reasons and write
 * probe rows on every build. Freshness is the only automatic pressure
 * available to them, which is exactly why it is enforced here.
 */
const LIVE_SCRIPTS = [
  'verify-paid-status-e2e',
  'verify-conversion-e2e',
  'verify-readonly-enforcement',
]

/** Default staleness ceiling. Shorter than the three weeks that went unnoticed. */
const DEFAULT_MAX_AGE_DAYS = 7

function load() {
  if (!existsSync(LOG)) return {}
  try {
    return JSON.parse(readFileSync(LOG, 'utf8'))
  } catch {
    return {}
  }
}

function save(data) {
  writeFileSync(LOG, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function daysSince(iso) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return Infinity
  return (Date.now() - t) / 86400000
}

const args = process.argv.slice(2)

// --- record ----------------------------------------------------------------
if (args[0] === '--record') {
  const [, name, outcome, ...rest] = args
  if (!name || !outcome) {
    console.error('usage: --record <name> <pass|fail> [detail]')
    process.exit(2)
  }
  const data = load()
  data[name] = {
    last_run: new Date().toISOString(),
    outcome,
    detail: rest.join(' ') || null,
  }
  save(data)
  process.exit(0)
}

// --- report ----------------------------------------------------------------
if (args[0] === '--report') {
  const data = load()
  console.log('script                        last run              age      outcome')
  for (const name of LIVE_SCRIPTS) {
    const e = data[name]
    if (!e) {
      console.log(`${name.padEnd(29)} NEVER RECORDED`)
      continue
    }
    const age = daysSince(e.last_run)
    console.log(
      `${name.padEnd(29)} ${e.last_run.slice(0, 16).replace('T', ' ')}   ` +
        `${age.toFixed(1).padStart(5)}d   ${e.outcome}${e.detail ? ' (' + e.detail + ')' : ''}`
    )
  }
  process.exit(0)
}

// --- check (the tripwire) --------------------------------------------------
const maxAgeIdx = args.indexOf('--max-age-days')
const maxAge = maxAgeIdx >= 0 ? Number(args[maxAgeIdx + 1]) : DEFAULT_MAX_AGE_DAYS

const data = load()
let failures = 0
let checks = 0
const pass = (m) => {
  checks++
  console.log(`PASS  ${m}`)
}
const fail = (m, d) => {
  checks++
  failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${d}`)
}

for (const name of LIVE_SCRIPTS) {
  const e = data[name]
  if (!e) {
    fail(
      `${name} has NEVER been recorded`,
      'run it, or it is a green tick standing in for a measurement nobody made'
    )
    continue
  }
  const age = daysSince(e.last_run)
  if (e.outcome !== 'pass') {
    fail(`${name} last run FAILED (${e.last_run.slice(0, 10)})`, e.detail || '')
  } else if (age > maxAge) {
    fail(
      `${name} last passed ${age.toFixed(1)} days ago, ceiling is ${maxAge}`,
      'the result is stale; a pass this old is not evidence'
    )
  } else {
    pass(`${name} passed ${age.toFixed(1)} days ago`)
  }
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  console.log('These three need a running dev server and a database, so they cannot run in')
  console.log('a build hook. Run them:  npm run verify:e2e')
  process.exit(1)
}
console.log('\nverification freshness check passed')
