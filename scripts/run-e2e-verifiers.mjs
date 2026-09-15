#!/usr/bin/env node
/**
 * run-e2e-verifiers.mjs
 *
 * Runs the three live-server verifiers and RECORDS the outcome of each, so
 * freshness becomes a fact rather than a memory.
 *
 * These three cannot run in a build hook: they need a dev server and they
 * write probe rows to the database. Putting them in prebuild would break
 * deploys for environmental reasons. So the pressure on them is the freshness
 * check (npm run verify:fresh), which fails when a result gets old -- and this
 * runner is what keeps that record honest, because it writes the entry itself
 * rather than asking anyone to remember a date.
 *
 * Usage:
 *   npm run verify:e2e                      # against http://localhost:3000
 *   node scripts/run-e2e-verifiers.mjs http://localhost:3100
 */

import { spawnSync } from 'node:child_process'

const BASE = process.argv[2] || process.env.VERIFY_BASE_URL || 'http://localhost:3000'
const ENV_FILE = process.env.VERIFY_ENV_FILE || '.env.local'

const SCRIPTS = [
  'verify-paid-status-e2e',
  'verify-conversion-e2e',
  'verify-readonly-enforcement',
]

// Reachability first. Three identical "cannot reach" failures are noise; one
// clear statement that no server is running is a diagnosis.
console.log(`base url: ${BASE}`)
try {
  const probe = await fetch(BASE, { signal: AbortSignal.timeout(5000) })
  const body = await probe.text()
  // A Next app serves _next assets; a different app on the same port does not.
  // Port 3000 has held an unrelated project before, and every route 404ing
  // looked exactly like a code defect until someone checked what was answering.
  if (!/\/_next\/|__NEXT_DATA__/.test(body) && probe.status === 200) {
    console.log('WARNING: the server on this port does not look like a Next app.')
    console.log('         Check that it is THIS project and not another one.')
  }
} catch (err) {
  console.log(`FAIL  nothing is listening on ${BASE}`)
  console.log(`      ${err?.message || err}`)
  console.log('\nStart the dev server first:  npm run dev')
  process.exit(1)
}

let failed = 0

for (const name of SCRIPTS) {
  console.log(`\n=== ${name} ===`)
  const res = spawnSync(process.execPath, [`scripts/${name}.mjs`, ENV_FILE, BASE], {
    stdio: 'inherit',
    shell: false,
  })
  const ok = res.status === 0
  if (!ok) failed++

  // Record the outcome whatever it is. A failure that is written down is a
  // problem; a failure nobody recorded is an ambush three weeks later.
  spawnSync(
    process.execPath,
    [
      'scripts/verify-log.mjs',
      '--record',
      name,
      ok ? 'pass' : 'fail',
      ok ? '' : `exit ${res.status}`,
    ].filter(Boolean),
    { stdio: 'ignore', shell: false }
  )
}

console.log('\n=== recorded ===')
spawnSync(process.execPath, ['scripts/verify-log.mjs', '--report'], { stdio: 'inherit', shell: false })

if (failed > 0) {
  console.log(`\n${failed} verifier(s) failed.`)
  process.exit(1)
}
console.log('\ne2e verifiers passed')
