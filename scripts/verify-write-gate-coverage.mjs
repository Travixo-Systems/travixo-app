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
  'app/api/admin/trigger-vgp-alerts/route.ts': 'platform admin only, gated by requireSuperAdminApi (asserted below)',
  'app/api/scan/update/route.ts': 'public QR scan logging; anonymous by design, service role',
  'app/api/assets/preview-import/route.ts': 'parses an uploaded file and returns a preview; writes nothing',
  'app/api/settings/onboarding/route.ts': 'dismisses a banner; freezing it would leave an expired pilot unable to close a prompt it can no longer act on',
  'app/api/settings/notifications/preferences/route.ts': 'per-user notification preferences, not tenant business data; gating it would leave an expired trial unable to stop email. user_notification_preferences is one of only two tables that never carried the anon grant',
}

const MUTATING = /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/

/**
 * Remove comments and string literals from TypeScript source.
 *
 * The gate used to test the raw file for /requireWriteAccess\s*\(/, which a
 * COMMENT satisfies. app/api/settings/notifications/preferences/route.ts
 * passed on exactly that: it carries
 *
 *   // NOTE: deliberately no requireWriteAccess() gate here, unlike the
 *
 * and does not import the function at all, so no call could exist. A security
 * check that a comment can satisfy reports PASS for a route with no gate --
 * the precise failure this file exists to prevent.
 *
 * Single-pass scanner rather than a chain of regexes, because regexes cannot
 * tell a quote inside a comment from a comment inside a quote, and getting
 * that wrong in either direction reintroduces the bug.
 */
function stripCommentsAndStrings(src) {
  let out = ''
  let i = 0
  const n = src.length

  while (i < n) {
    const c = src[i]
    const next = src[i + 1]

    // line comment
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }

    // block comment
    if (c === '/' && next === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }

    // string or template literal. Templates may contain ${...} with real code,
    // but a gate call inside an interpolation is not a call site worth
    // crediting, so the whole literal is dropped.
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i++
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === quote) { i++; break }
        i++
      }
      // preserve a separator so `a"x"b` cannot fuse into one identifier
      out += ' '
      continue
    }

    out += c
    i++
  }

  return out
}

/** True when the source contains a real call, not a mention of one. */
function callsWriteGate(src) {
  const code = stripCommentsAndStrings(src)
  // An import alone is not a call; require an invocation.
  return /\brequireWriteAccess\s*\(/.test(code)
}

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
  if (callsWriteGate(src)) gated.push(r)
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

// An exemption reason is free text and nothing verified it. One of them claimed
// the admin trigger route was "already gated by requireSuperAdmin" while the
// file gated on the TENANT role (users.role in ('admin','owner')) and never
// imported the guard at all -- so every tenant owner could fire a cron that
// sends real customer email. The reason read as a finished control, which is
// exactly why nobody re-read the file. Assert the claim instead of trusting it.
const ADMIN_ROUTES = routes.filter(r => r.startsWith('app/api/admin/'))
if (ADMIN_ROUTES.length === 0) {
  fail('no app/api/admin routes found -- the admin scan matched nothing')
} else {
  const ungatedAdmin = []
  const tenantRoleGated = []
  for (const r of ADMIN_ROUTES) {
    const src = readFileSync(r, 'utf8')
    if (!/requireSuperAdminApi\s*\(/.test(src)) ungatedAdmin.push(r)
    // The specific regression: authorising a platform endpoint on tenant role.
    if (/\[['"]admin['"],\s*['"]owner['"]\]|\[['"]owner['"],\s*['"]admin['"]\]/.test(src)) {
      tenantRoleGated.push(r)
    }
  }

  if (ungatedAdmin.length === 0) {
    pass(`all ${ADMIN_ROUTES.length} app/api/admin route(s) call requireSuperAdminApi()`)
  } else {
    fail(
      `${ungatedAdmin.length} app/api/admin route(s) do not call requireSuperAdminApi()`,
      ungatedAdmin.join('\n      ')
    )
  }

  if (tenantRoleGated.length === 0) {
    pass('no app/api/admin route authorises on a tenant role')
  } else {
    fail(
      `${tenantRoleGated.length} app/api/admin route(s) authorise on tenant role, not platform_admins`,
      tenantRoleGated.join('\n      ')
    )
  }
}

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

// --------------------------------------------------------------------------
// Negative control for the detector itself.
//
// This check exists because the detector was wrong once and still reported
// PASS. It tested the raw source for /requireWriteAccess\s*\(/, which a
// COMMENT satisfies, so a route carrying
//     // NOTE: deliberately no requireWriteAccess() gate here
// and no import at all counted as gated.
//
// The fixtures below are inline rather than files on disk: a fixture route
// under app/api/ would be picked up by the real scan, and one anywhere else
// would eventually be deleted as dead code by someone who could not see what
// it was for.
// --------------------------------------------------------------------------
{
  const mustNotCount = {
    'line comment': `
      export async function POST() {
        // NOTE: deliberately no requireWriteAccess() gate here, unlike the
        // org-level route.
        return Response.json({ ok: true })
      }`,
    'block comment': `
      export async function PATCH() {
        /* requireWriteAccess() is intentionally absent */
        return Response.json({ ok: true })
      }`,
    'string literal': `
      export async function DELETE() {
        console.log('requireWriteAccess(supabase) was skipped')
        return Response.json({ ok: true })
      }`,
    'template literal': `
      export async function PUT() {
        const msg = \`requireWriteAccess(\${x}) not called\`
        return Response.json({ msg })
      }`,
    'import without a call': `
      import { requireWriteAccess } from '@/lib/server/require-write-access'
      export async function POST() { return Response.json({ ok: true }) }`,
  }

  const mustCount = {
    'plain call': `
      import { requireWriteAccess } from '@/lib/server/require-write-access'
      export async function POST() {
        const gate = await requireWriteAccess(supabase)
        if (gate.denied) return gate.denied
        return Response.json({ ok: true })
      }`,
    'call after a comment that mentions it': `
      export async function POST() {
        // requireWriteAccess() below, see the header
        const gate = await requireWriteAccess(supabase)
        if (gate.denied) return gate.denied
        return Response.json({ ok: true })
      }`,
  }

  const wrong = []
  for (const [name, src] of Object.entries(mustNotCount)) {
    if (callsWriteGate(src)) wrong.push(`${name} counted as a call`)
  }
  for (const [name, src] of Object.entries(mustCount)) {
    if (!callsWriteGate(src)) wrong.push(`${name} NOT counted as a call`)
  }

  if (wrong.length === 0) {
    pass(
      `detector rejects ${Object.keys(mustNotCount).length} mention-only fixture(s) ` +
      `and accepts ${Object.keys(mustCount).length} real call(s)`
    )
  } else {
    fail('the write-gate detector miscounts its own fixtures', wrong.join('\n      '))
  }
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nwrite gate coverage verification passed')
