#!/usr/bin/env node
/**
 * verify-write-gate-coverage.mjs
 *
 * Every mutating API route must either call requireWriteAccess() or be listed
 * below with a reason. A new POST/PATCH/DELETE route that does neither fails
 * this check, so the gate cannot quietly rot as the API grows.
 *
 * Prints "write gate coverage verification passed" only when every mutating
 * route is accounted for.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// Routes deliberately NOT gated. A read-only or locked org must still be able
// to pay, manage its own login, and receive machine callbacks — gating these
// would trap a customer who is trying to give you money.
const EXEMPT = {
  'app/api/stripe/checkout/route.ts': 'the upgrade path itself; gating it traps a customer trying to pay',
  'app/api/stripe/portal/route.ts': 'billing portal; same reason',
  'app/api/stripe/webhook/route.ts': 'machine callback from Stripe, authenticated by signature',
  'app/api/subscriptions/route.ts': 'plan changes; part of the upgrade path',
  'app/api/settings/profile/password/route.ts': 'account security; must never be blocked',
  'app/api/settings/profile/route.ts': 'own profile; not tenant data',
  'app/api/team/invitations/accept/route.ts': 'accepting an invite is how a user joins; runs before org context',
  'app/api/internal/post-registration/route.ts': 'runs during signup, before any pilot exists',
  'app/api/admin/trigger-vgp-alerts/route.ts': 'platform admin only, already gated by requireSuperAdmin',
  'app/api/scan/update/route.ts': 'public QR scan logging; anonymous by design, service role',
  'app/api/assets/preview-import/route.ts': 'parses an uploaded file and returns a preview; writes nothing',
}

const MUTATING = /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e === 'route.ts') out.push(p.split('\\').join('/'))
  }
  return out
}

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 600)}`)
}

const routes = walk('app/api')
const mutating = routes.filter(r => MUTATING.test(readFileSync(r, 'utf8')))

if (mutating.length === 0) {
  console.log('FAIL  found no mutating routes -- the scan matched nothing')
  process.exit(1)
}

const ungated = []
const gated = []
for (const r of mutating) {
  if (EXEMPT[r]) continue
  const src = readFileSync(r, 'utf8')
  if (/requireWriteAccess\s*\(/.test(src)) gated.push(r)
  else ungated.push(r)
}

pass(`scanned ${mutating.length} mutating route(s); ${Object.keys(EXEMPT).length} exempt by policy`)

if (ungated.length === 0) {
  pass(`all ${gated.length} gateable route(s) call requireWriteAccess()`)
} else {
  fail(
    `${ungated.length} mutating route(s) do not call requireWriteAccess()`,
    ungated.join('\n      ')
  )
}

// Every exemption must name a real file, so the list cannot hide a typo that
// silently exempts nothing while looking thorough.
const stale = Object.keys(EXEMPT).filter(f => !routes.includes(f))
if (stale.length === 0) pass('every exemption refers to a route that exists')
else fail('exemption list contains paths that do not exist', stale.join(', '))

// The gate must fail closed. Assert the helper denies on a lookup error.
const helper = 'lib/server/require-write-access.ts'
try {
  const src = readFileSync(helper, 'utf8')
  if (/orgError\s*\|\|\s*!org/.test(src) && /Fail closed/i.test(src)) {
    pass('requireWriteAccess fails closed on a lookup error')
  } else {
    fail('requireWriteAccess does not visibly fail closed on a lookup error')
  }
} catch {
  fail(`${helper} not found`)
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nwrite gate coverage verification passed')
