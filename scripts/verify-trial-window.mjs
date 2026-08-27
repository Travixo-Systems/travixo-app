#!/usr/bin/env node
/**
 * verify-trial-window.mjs
 *
 * Asserts the pilot window is defined once and encodes 30 full + 15 grace,
 * that both consumers use the shared helper rather than a local magic number,
 * and that the SQL migration's INTERVAL agrees with PILOT_FULL_DAYS.
 *
 * Prints "trial window verification passed" only when every assertion holds.
 */

import { readFileSync, existsSync } from 'fs'

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 200)}`)
}

// --- the shared module ------------------------------------------
const modPath = 'lib/billing/pilot-window.ts'
if (!existsSync(modPath)) {
  fail(`${modPath} does not exist -- the window is not defined in one place`)
} else {
  const src = readFileSync(modPath, 'utf8')

  const full = src.match(/PILOT_FULL_DAYS\s*=\s*(\d+)/)
  const grace = src.match(/PILOT_GRACE_DAYS\s*=\s*(\d+)/)

  if (full && full[1] === '30') pass('PILOT_FULL_DAYS = 30')
  else fail(`PILOT_FULL_DAYS is ${full ? full[1] : 'missing'}, expected 30`)

  if (grace && grace[1] === '15') pass('PILOT_GRACE_DAYS = 15')
  else fail(`PILOT_GRACE_DAYS is ${grace ? grace[1] : 'missing'}, expected 15`)

  if (/PILOT_LOCKOUT_DAYS\s*=\s*PILOT_FULL_DAYS\s*\+\s*PILOT_GRACE_DAYS/.test(src)) {
    pass('PILOT_LOCKOUT_DAYS derives from the two windows (45)')
  } else {
    fail('PILOT_LOCKOUT_DAYS is not derived from PILOT_FULL_DAYS + PILOT_GRACE_DAYS')
  }
}

// --- both consumers use the helper, not a local number ----------
const consumers = [
  'lib/billing/entitlements.ts',
  'app/api/subscriptions/route.ts',
]

for (const file of consumers) {
  if (!existsSync(file)) { fail(`${file} not found`); continue }
  const src = readFileSync(file, 'utf8')

  if (/from ['"]@\/lib\/billing\/pilot-window['"]/.test(src)) {
    pass(`${file} imports the shared window`)
  } else {
    fail(`${file} does not import lib/billing/pilot-window`)
  }

  if (/isAccountLocked\s*\(/.test(src)) {
    pass(`${file} calls isAccountLocked()`)
  } else {
    fail(`${file} does not call the shared isAccountLocked()`)
  }

  // The old shape was `daysSincePilotStart > 30` inline. It must be gone.
  if (/daysSincePilotStart\s*>\s*\d+/.test(src)) {
    fail(`${file} still contains an inline day-count comparison`)
  } else {
    pass(`${file} has no inline day-count cutoff`)
  }
}

// --- the migration agrees with the constant ---------------------
const mig = 'supabase/migrations/20260827_trial_30_days.sql'
if (!existsSync(mig)) {
  fail(`${mig} not found -- new signups would still get the old window`)
} else {
  const sql = readFileSync(mig, 'utf8')
  const fnBody = sql.split('-- 2.')[0] // section 1 only: the signup function

  const intervals = [...fnBody.matchAll(/INTERVAL\s+'(\d+)\s+days'/g)].map(m => m[1])
  if (intervals.length === 0) {
    fail('migration section 1 declares no INTERVAL')
  } else if (intervals.every(v => v === '30')) {
    pass(`migration grants 30 days in all ${intervals.length} INTERVAL(s)`)
  } else {
    fail(`migration has mixed intervals: ${[...new Set(intervals)].join(', ')}`)
  }

  // The UPDATE must only ever widen a window.
  if (/pilot_end_date\s*<\s*pilot_start_date\s*\+\s*INTERVAL\s+'30 days'/.test(sql)) {
    pass('backfill only extends pilots shorter than 30 days (never shortens)')
  } else {
    fail('backfill lacks the "only if shorter" guard -- it could shorten a pilot')
  }

  // CREATE OR REPLACE resets ACL/config, so the hardening must be re-asserted.
  if (/REVOKE ALL ON FUNCTION .* FROM anon/.test(sql) && /SET search_path/.test(sql)) {
    pass('migration re-asserts the anon revoke and pinned search_path')
  } else {
    fail('migration does not re-assert hardening -- CREATE OR REPLACE would undo it')
  }
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\ntrial window verification passed')
