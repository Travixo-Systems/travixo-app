#!/usr/bin/env node
/**
 * verify-no-probe.mjs
 *
 * The two-tab diagnostic probe (PR #61) was merged to main deliberately, to
 * capture production console output that three source-reading diagnoses had
 * failed to explain. It did its job: it proved the identity swap.
 *
 * It must not stay. It ships a SECOND Supabase client and three extra
 * BroadcastChannels to every real user, which measurably worsens the
 * Navigator LockManager contention already visible in production logs -- and
 * it prints auth events to the console of a live app.
 *
 * This gate fails while any part of it remains in shipped code.
 *
 * Prints "no diagnostic probe in shipped code" only when every case holds.
 */

import { existsSync, readFileSync } from 'fs'

let failures = 0
let checks = 0
const pass = (m) => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 300)}`)
}

// 1. The probe component itself must be gone.
if (existsSync('components/SlotProbe.tsx')) {
  fail('components/SlotProbe.tsx still exists')
} else {
  pass('components/SlotProbe.tsx is removed')
}

// 2. Nothing may still mount it.
const LAYOUT = 'app/layout.tsx'
if (!existsSync(LAYOUT)) {
  fail(`${LAYOUT} missing`)
} else {
  const layout = readFileSync(LAYOUT, 'utf8')
  if (/SlotProbe/.test(layout)) {
    fail(`${LAYOUT} still references SlotProbe`)
  } else {
    pass(`${LAYOUT} does not mount the probe`)
  }
}

// 3. No probe logging may remain anywhere in shipped source.
//
// Scans the directories that are actually bundled. `scripts/` is deliberately
// excluded: this file necessarily contains the marker strings it searches for,
// and verification code does not ship.
const SHIPPED = ['app', 'components', 'lib', 'proxy.ts']
const MARKERS = [/\[PROBE\s/, /\[LANGCTX\s/, /-{4,}\s*tab boot/]

/** Every source file under a path, without relying on a shell glob. */
async function walk(p, out = []) {
  const { readdirSync, statSync } = await import('fs')
  const { join } = await import('path')
  if (!existsSync(p)) return out
  if (statSync(p).isFile()) { out.push(p); return out }
  for (const entry of readdirSync(p)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    await walk(join(p, entry), out)
  }
  return out
}

const offenders = []
for (const root of SHIPPED) {
  for (const file of await walk(root)) {
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const marker of MARKERS) {
      if (marker.test(text)) {
        offenders.push(`${file} matches ${marker}`)
        break
      }
    }
  }
}

if (offenders.length === 0) {
  pass(`no probe logging in ${SHIPPED.join(', ')}`)
} else {
  fail(`${offenders.length} file(s) still contain probe logging`, offenders.join('\n      '))
}

// 4. Negative control.
//
// Check 3 is an ABSENCE check, and an absence check is worthless until it has
// been shown to fire. A typo in any MARKER regex would make it pass silently
// on a tree that still carried the probe.
//
// So run the real markers against a synthetic sample of the probe's actual
// output. If they do not match this, they would not have matched the probe.
const SAMPLE = [
  '[PROBE s1] ---------- tab boot ----------',
  '[PROBE s1] storageKey        = travixo-auth-1',
  '[LANGCTX s0] event=SIGNED_OUT willNavigate=true',
].join('\n')

const matched = MARKERS.filter((m) => m.test(SAMPLE))
if (matched.length === MARKERS.length) {
  pass(`negative control: all ${MARKERS.length} marker patterns fire on real probe output`)
} else {
  const missed = MARKERS.filter((m) => !m.test(SAMPLE)).map(String)
  fail(
    `negative control: ${missed.length} marker pattern(s) do NOT match real probe output`,
    `absence check is unreliable -- ${missed.join(', ')}`
  )
}

console.log('')
if (failures > 0) {
  console.log(`${failures} of ${checks} checks FAILED`)
  process.exit(1)
}
console.log(`all ${checks} checks passed`)
console.log('no diagnostic probe in shipped code')
