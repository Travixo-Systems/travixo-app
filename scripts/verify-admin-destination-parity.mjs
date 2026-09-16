#!/usr/bin/env node
/**
 * verify-admin-destination-parity.mjs
 *
 * Two places decide where a login lands, and they must apply the SAME rule.
 *
 *   app/(auth)/login/page.tsx   a fresh sign-in
 *   proxy.ts                    an already-signed-in user opening /login
 *                               when every account slot is occupied
 *
 * The rule is two conditions, and they answer different questions:
 *
 *   is_super_admin()          may this person use /admin at all
 *   organization_id IS NULL   is /dashboard meaningless for them
 *
 * A platform admin who ALSO belongs to an organization keeps the tenant
 * dashboard -- that org is real work they would lose by being bounced away
 * from it. They reach /admin from the sidebar instead.
 *
 * proxy.ts checked only the first condition, so the same user got /admin from
 * one path and /dashboard from the other. This gate fails while either path
 * decides on is_super_admin() alone.
 *
 * WHY THIS IS A STATIC CHECK, AND WHAT THAT COSTS
 * ----------------------------------------------
 *
 * It reads source text. It cannot prove the two paths agree at runtime -- only
 * that both mention both conditions near their /admin decision. The
 * multiaccount gates in this repo pass 23/23 and 28/28 against behaviour that
 * was broken in production precisely because they text-match, so this file
 * does not pretend to be more than it is.
 *
 * What makes it non-vacuous is section 3: the same detector is run against a
 * synthetic copy of the OLD one-condition code and must report it BROKEN. A
 * detector that cannot fail is not a check.
 *
 * Prints "admin destination parity verified" only when every case holds.
 */

import { existsSync, readFileSync } from 'fs'

let failures = 0
let checks = 0
const pass = (m) => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 400)}`)
}

const PROXY = 'proxy.ts'
const LOGIN = 'app/(auth)/login/page.tsx'

/**
 * Does this source decide `/admin` using BOTH conditions?
 *
 * Looks at the window of text around each assignment of '/admin' rather than
 * the whole file: a file can mention organization_id far away for unrelated
 * reasons, and counting that would make the check pass by coincidence.
 */
function decidesOnBothConditions(source) {
  // Every place the destination becomes '/admin'.
  const sites = [...source.matchAll(/=\s*['"]\/admin['"]/g)]
  if (sites.length === 0) return { ok: false, reason: "no assignment of '/admin' found" }

  for (const site of sites) {
    // The 900 characters before the assignment: enough to hold the rpc call,
    // the profile read and the condition, without spilling into unrelated code.
    const start = Math.max(0, site.index - 900)
    const window = source.slice(start, site.index)

    const hasAdminCheck = /is_super_admin/.test(window)
    if (!hasAdminCheck) continue // not the admin destination decision

    const hasOrgCheck = /organization_id/.test(window)
    if (!hasOrgCheck) {
      return {
        ok: false,
        reason: `an '/admin' decision checks is_super_admin() without organization_id`,
      }
    }
  }

  // At least one site must actually be the admin decision.
  const anyAdminDecision = sites.some((s) =>
    /is_super_admin/.test(source.slice(Math.max(0, s.index - 900), s.index))
  )
  if (!anyAdminDecision) {
    return { ok: false, reason: "no '/admin' decision gated on is_super_admin() found" }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------
// 1. Both files exist and both decide on both conditions
// ---------------------------------------------------------------------
for (const file of [PROXY, LOGIN]) {
  if (!existsSync(file)) {
    fail(`${file} is missing`)
    continue
  }
  const verdict = decidesOnBothConditions(readFileSync(file, 'utf8'))
  if (verdict.ok) {
    pass(`${file} decides /admin on is_super_admin() AND organization_id`)
  } else {
    fail(`${file} does not apply both conditions`, verdict.reason)
  }
}

// ---------------------------------------------------------------------
// 2. The proxy actually reads the users row
//
// Section 1 would accept the word "organization_id" appearing in a comment.
// The proxy has no other reason to touch that column, so require the read.
// ---------------------------------------------------------------------
if (existsSync(PROXY)) {
  const proxy = readFileSync(PROXY, 'utf8')
  const readsUsers =
    /from\(\s*['"]users['"]\s*\)/.test(proxy) &&
    /select\(\s*['"][^'"]*organization_id/.test(proxy)
  if (readsUsers) {
    pass(`${PROXY} reads organization_id from the users table`)
  } else {
    fail(
      `${PROXY} never reads organization_id -- it cannot apply the second condition`,
      'a comment mentioning the column is not a check'
    )
  }
}

// ---------------------------------------------------------------------
// 3. NEGATIVE CONTROL
//
// Run the detector against the exact pre-fix proxy code. It MUST report it
// broken. Without this, a typo in the regexes would let section 1 pass on a
// tree that still had the defect.
// ---------------------------------------------------------------------
const PRE_FIX = `
    let destination = '/dashboard'
    const { data: isAdmin } = await supabase.rpc('is_super_admin')
    if (isAdmin === true) destination = '/admin'
    return NextResponse.redirect(
      new URL(withSlotPath(slot, destination), request.url)
    )
`
const POST_FIX = `
    let destination = '/dashboard'
    const [{ data: isAdmin }, { data: profile }] = await Promise.all([
      supabase.rpc('is_super_admin'),
      supabase.from('users').select('organization_id').eq('id', user.id).maybeSingle(),
    ])
    if (isAdmin === true && !profile?.organization_id) {
      destination = '/admin'
    }
`

const preVerdict = decidesOnBothConditions(PRE_FIX)
const postVerdict = decidesOnBothConditions(POST_FIX)

if (!preVerdict.ok) {
  pass('negative control: the detector reports the pre-fix one-condition code BROKEN')
} else {
  fail(
    'negative control vacuous: the detector accepts the pre-fix one-condition code',
    'section 1 therefore proves nothing'
  )
}

if (postVerdict.ok) {
  pass('positive control: the detector accepts the two-condition form')
} else {
  fail(
    'positive control failed: the detector rejects correct two-condition code',
    postVerdict.reason
  )
}

console.log('')
if (failures > 0) {
  console.log(`${failures} of ${checks} checks FAILED`)
  process.exit(1)
}
console.log(`all ${checks} checks passed`)
console.log('admin destination parity verified')
