#!/usr/bin/env node
/**
 * verify-admin-login-redirect.mjs
 *
 * The post-login /admin redirect must require BOTH conditions:
 *
 *   is_super_admin()          may this person use /admin at all
 *   organization_id IS NULL   is /dashboard meaningless for them
 *
 * WHY THIS GATE EXISTS
 *
 * The natural regression is to drop the second condition, because
 * is_super_admin() alone reads like the whole question. It is not: a platform
 * admin who also belongs to an organization would then be bounced away from
 * real tenant work every time they signed in, with no way back except typing
 * a URL.
 *
 * That exact shape is still live in proxy.ts, which is why this checks the
 * proxy too and reports its state rather than asserting it -- that file needs
 * explicit approval to change (docs/working-agreements.md:98-107).
 *
 * Prints "admin login redirect verification passed" only when every check holds.
 */

import { readFileSync, existsSync } from 'fs'

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 300)}`)
}
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null)

const LOGIN = 'app/(auth)/login/page.tsx'
const SIDEBAR = 'components/Sidebar.tsx'
const I18N = 'lib/i18n.ts'
const PROXY = 'proxy.ts'

// ---------------------------------------------------------------------
// 1. The login redirect requires both conditions
// ---------------------------------------------------------------------
const login = read(LOGIN)
if (!login) {
  fail(`${LOGIN} not found`)
} else {
  if (/is_super_admin/.test(login)) pass('login checks is_super_admin()')
  else fail('login does not check is_super_admin()')

  // The conjunct. Accept either ordering, but it must be an AND with the
  // org test -- not is_super_admin() alone.
  const conj =
    /isAdmin\s*===\s*true\s*&&\s*!\s*\w+\??\.\w*organization_id/.test(login) ||
    /!\s*\w+\??\.\w*organization_id\s*&&\s*isAdmin\s*===\s*true/.test(login)
  if (conj) pass('login requires is_super_admin() AND a null organization_id')
  else fail('login does not AND the org condition -- an org-bearing admin would be bounced to /admin')

  // Negative control: the bare form must not survive anywhere in the file.
  const bare = /if\s*\(\s*isAdmin\s*===\s*true\s*\)\s*\{?\s*destination\s*=\s*'\/admin'/.test(login)
  if (!bare) pass('login carries no bare is_super_admin() -> /admin assignment')
  else fail('login still assigns /admin on is_super_admin() alone')

  // The reads must use the post-sign-in client. The module-level one holds
  // the PREVIOUS slot's session, so on a second-account login it answers for
  // the wrong user.
  const scoped = /scopedSupabase\.rpc\('is_super_admin'\)/.test(login)
  if (scoped) pass('the admin lookup uses the post-sign-in scoped client')
  else fail('the admin lookup does not use scopedSupabase -- it may answer for the previous account')

  // A routing lookup must never fail the login.
  if (/catch\s*\{[\s\S]{0,400}?\}/.test(login) && /let destination = '\/dashboard'/.test(login)) {
    pass('a failed lookup falls back to /dashboard rather than failing the login')
  } else {
    fail('no safe fallback around the routing lookup')
  }
}

// ---------------------------------------------------------------------
// 2. The sidebar entry is the other half of the rule
// ---------------------------------------------------------------------
const sidebar = read(SIDEBAR)
if (!sidebar) {
  fail(`${SIDEBAR} not found`)
} else {
  if (/href:\s*'\/admin'/.test(sidebar)) pass('sidebar offers an /admin entry')
  else fail('sidebar has no /admin entry -- an org-bearing admin cannot reach it')

  if (/showAdminLink/.test(sidebar) && /is_super_admin/.test(sidebar)) {
    pass('the sidebar entry is conditional on is_super_admin()')
  } else {
    fail('the sidebar entry is not gated on is_super_admin()')
  }

  // It must be appended, not inserted: the mobile rail slices at index 2.
  const navBlock = sidebar.match(/const navigation = \[[\s\S]*?\n {2}\];/)
  if (navBlock && /\.\.\.\(showAdminLink[\s\S]*?\)\,?\s*\n\s*\];/.test(navBlock[0])) {
    pass('the admin entry is appended last, so navigation.slice(0,2) is undisturbed')
  } else {
    fail('the admin entry is not appended last; the mobile rail slice would reshuffle')
  }

  if (/t\('navigation\.platformAdmin'\)/.test(sidebar)) pass('the entry label is translated')
  else fail('the entry label is hardcoded')
}

// ---------------------------------------------------------------------
// 3. i18n, both languages
// ---------------------------------------------------------------------
const i18n = read(I18N)
if (i18n) {
  const key = i18n.match(/platformAdmin:\s*\{[\s\S]*?\},/)
  if (key && /\ben:/.test(key[0]) && /\bfr:/.test(key[0])) {
    pass('navigation.platformAdmin exists in en and fr')
  } else {
    fail('navigation.platformAdmin missing an en or fr value')
  }
}

// ---------------------------------------------------------------------
// 4. proxy.ts: REPORTED, not asserted
// ---------------------------------------------------------------------
// proxy.ts needs explicit approval to change (working-agreements.md:98-107),
// so this states its condition rather than failing on it. When the proxy is
// updated to match, this check starts passing on its own.
const proxy = read(PROXY)
if (proxy) {
  const proxyBare = /const \{ data: isAdmin \} = await supabase\.rpc\('is_super_admin'\)\s*\n\s*if \(isAdmin === true\) destination = '\/admin'/.test(proxy)
  if (proxyBare) {
    console.log("NOTE  proxy.ts still redirects on is_super_admin() alone, with no organization_id test.")
    console.log("      That is the /login bounce for an already-signed-in user, not the post-login path.")
    console.log("      It needs explicit approval to change; the diff is in the report.")
  } else if (/organization_id/.test(proxy) && /is_super_admin/.test(proxy)) {
    pass('proxy.ts also requires both conditions')
  }
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nadmin login redirect verification passed')
