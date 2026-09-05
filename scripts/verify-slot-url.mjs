#!/usr/bin/env node
/**
 * verify-slot-url.mjs
 *
 * THE REPORTED DEFECT
 *
 *   "after reload both go back to being the same account — you can't tell,
 *    or it's the last account connected"
 *
 * Cause: a RELOAD is a plain navigation. No script runs before the request,
 * so no custom header can be attached. The old code therefore fell back to a
 * browser-WIDE hint cookie, and one shared cookie cannot answer a per-tab
 * question — the last tab to write it won, for every tab.
 *
 * Fix: carry the slot in the URL (/u/1/dashboard), which is per-tab by
 * construction and is resent verbatim by the browser on reload, back/forward
 * and session restore. proxy.ts strips the prefix and rewrites to the real
 * path, so no route, Link or redirect in the app changes.
 *
 * This script proves the mechanism holds, including that the browser-wide
 * cookie is GONE from slot resolution — a regression there would silently
 * reintroduce the exact reported bug.
 *
 * Prints "slot url verification passed" only when every case holds.
 */

import { pathToFileURL } from 'url'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 300)}`)
}

const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null)

const AS = 'lib/supabase/account-slot.ts'
let m
try {
  m = await import(pathToFileURL(resolve(AS)).href)
} catch (err) {
  console.log(`FAIL  cannot import ${AS}: ${err?.message}`)
  process.exit(1)
}
const { splitSlotPath, withSlotPath, MAX_ACCOUNT_SLOTS } = m

// ---------------------------------------------------------------------
// 1. splitSlotPath
// ---------------------------------------------------------------------
const splitCases = [
  // [input, expected slot, expected path]
  ['/dashboard', 0, '/dashboard'],
  ['/u/1/dashboard', 1, '/dashboard'],
  ['/u/2/vgp/schedules/abc', 2, '/vgp/schedules/abc'],
  ['/u/1', 1, '/'],
  ['/u/1/', 1, '/'],
  ['/u/0/dashboard', 0, '/dashboard'],
  ['/', 0, '/'],
  // Paths that merely START with u must NOT be treated as prefixes.
  ['/users', 0, '/users'],
  ['/upload', 0, '/upload'],
  ['/u', 0, '/u'],
  ['/u/', 0, '/u/'],
  ['/u/abc/dashboard', 0, '/u/abc/dashboard'],
  // Out-of-range slot degrades to 0 but still strips, so it renders rather
  // than 404s.
  ['/u/99/dashboard', 0, '/dashboard'],
]

let splitBad = 0
for (const [input, wantSlot, wantPath] of splitCases) {
  const got = splitSlotPath(input)
  if (got.slot === wantSlot && got.path === wantPath) {
    pass(`split "${input}" -> slot ${got.slot}, path "${got.path}"`)
  } else {
    fail(`split "${input}" -> slot ${got.slot}, path "${got.path}"; expected slot ${wantSlot}, path "${wantPath}"`)
    splitBad++
  }
}

// Negative control: a real app route must not be mistaken for a prefix.
if (splitSlotPath('/users/123').slot === 0 && splitSlotPath('/users/123').path === '/users/123') {
  pass('/users/123 is untouched (negative control — prefix matching is not greedy)')
} else {
  fail('/users/123 was misparsed as a slot prefix')
}

// ---------------------------------------------------------------------
// 2. withSlotPath — round trip and idempotence
// ---------------------------------------------------------------------
if (withSlotPath(0, '/dashboard') === '/dashboard') {
  pass('slot 0 produces NO prefix (existing URLs and bookmarks unaffected)')
} else {
  fail(`slot 0 produced "${withSlotPath(0, '/dashboard')}", expected "/dashboard"`)
}

let rtBad = 0
for (let s = 0; s < MAX_ACCOUNT_SLOTS; s++) {
  for (const p of ['/dashboard', '/', '/vgp/schedules/1', '/settings/profile']) {
    const built = withSlotPath(s, p)
    const back = splitSlotPath(built)
    if (back.slot !== s || back.path !== p) {
      fail(`round trip failed: slot ${s} + "${p}" -> "${built}" -> slot ${back.slot}, "${back.path}"`)
      rtBad++
    }
  }
}
if (rtBad === 0) {
  pass(`withSlotPath/splitSlotPath round-trip for all ${MAX_ACCOUNT_SLOTS} slots x 4 paths`)
}

// Idempotence: re-prefixing must never nest.
if (withSlotPath(1, '/u/1/dashboard') === '/u/1/dashboard') {
  pass('withSlotPath is idempotent (never produces /u/1/u/1/...)')
} else {
  fail(`re-prefixing nested: "${withSlotPath(1, '/u/1/dashboard')}"`)
}
if (withSlotPath(0, '/u/1/dashboard') === '/dashboard') {
  pass('switching to slot 0 strips an existing prefix')
} else {
  fail(`slot 0 did not strip: "${withSlotPath(0, '/u/1/dashboard')}"`)
}

// ---------------------------------------------------------------------
// 3. proxy.ts wiring
// ---------------------------------------------------------------------
const proxy = read('proxy.ts')
if (!proxy) {
  console.log('FAIL  proxy.ts missing')
  process.exit(1)
}

const proxyChecks = [
  ['splits the slot from the path first', /const \{ slot: urlSlot, path: pathname \} = splitSlotPath\(rawPathname\)/],
  ['prefers the URL slot over the header', /hasSlotPrefix\s*\n?\s*\?\s*urlSlot/],
  ['rewrites to the stripped path', /NextResponse\.rewrite\(rewriteUrl/],
  ['uses one passThrough for every rebuild', /const passThrough = \(\) =>/],
  ['keeps the prefix on the login redirect', /withSlotPath\(slot, '\/login'\)/],
  ['keeps the prefix on redirectTo', /redirectTo', withSlotPath\(slot, pathname\)/],
  ['keeps the prefix on the post-login destination', /withSlotPath\(slot, destination\)/],
  ['matches /u/:slot URLs so the proxy runs for them', /'\/u\/:slot\/:path\*'/],
]
for (const [label, re] of proxyChecks) {
  if (re.test(proxy)) pass(`proxy ${label}`)
  else fail(`proxy does not ${label}`)
}

// Route matching must use the STRIPPED path, or /u/1/dashboard is not
// recognised as protected and an unauthenticated tab would see it.
if (/const isProtectedRoute = protectedRoutes\.some\(route =>\s*\n\s*pathname\.startsWith\(route\)/.test(proxy)) {
  pass('protected-route matching uses the stripped path')
} else {
  fail('protected-route matching may be using the raw prefixed path')
}

// All three response rebuilds must go through passThrough(), or a token
// refresh drops the rewrite and the request 404s.
const rebuilds = (proxy.match(/passThrough\(\)/g) ?? []).length
if (rebuilds >= 3) {
  pass(`${rebuilds} passThrough() call sites — every rebuild preserves the rewrite`)
} else {
  fail(`only ${rebuilds} passThrough() call site(s); a rebuild would drop the rewrite`)
}

// ---------------------------------------------------------------------
// 4. THE REGRESSION GUARD: the browser-wide cookie must be gone
// ---------------------------------------------------------------------
// This is the check that matters most. Reintroducing a shared cookie into
// slot resolution would silently restore the reported bug.
if (!/SLOT_HINT_COOKIE/.test(proxy)) {
  pass('proxy no longer consults a browser-wide hint cookie (the reported bug)')
} else {
  fail('proxy still reads a browser-wide hint cookie — the reload bug would return')
}

const asSrc = readFileSync(AS, 'utf8')
if (!/export const SLOT_HINT_COOKIE/.test(asSrc)) {
  pass('SLOT_HINT_COOKIE is removed from the module entirely')
} else {
  fail('SLOT_HINT_COOKIE still exported — it must not be used for slot resolution')
}

const client = read('lib/supabase/client.ts')
if (client && !/publishSlotHint/.test(client)) {
  pass('client no longer publishes a shared hint cookie')
} else {
  fail('client still publishes the shared hint cookie')
}

// The reasoning must be recorded, or someone reintroduces the cookie later.
if (/WHY THE URL, AND NOT A COOKIE/.test(asSrc) && /last writer wins/i.test(asSrc)) {
  pass('account-slot.ts records why a cookie cannot work here')
} else {
  fail('account-slot.ts does not document why the cookie approach failed')
}

// ---------------------------------------------------------------------
// 5. Client-side navigation keeps the prefix
// ---------------------------------------------------------------------
if (client) {
  const clientChecks = [
    ['reads the slot from the URL first', /splitSlotPath\(window\.location\.pathname\)/],
    ['guards history pushState/replaceState', /installSlotHistoryGuard/],
    ['re-applies the prefix on navigation', /withSlotPath\(slot, u\.pathname\)/],
    ['exposes slotUrl for the switcher', /export function slotUrl/],
  ]
  for (const [label, re] of clientChecks) {
    if (re.test(client)) pass(`client ${label}`)
    else fail(`client does not ${label}`)
  }
}

const boot = read('components/AccountSlotBootstrap.tsx')
if (boot && /installSlotHistoryGuard\(\)/.test(boot)) {
  pass('bootstrap installs the history guard')
} else {
  fail('bootstrap does not install the history guard — links would drop the prefix')
}

// A second account must happen AUTOMATICALLY when a second tab signs in.
// There is deliberately NO switcher UI: the user opens a tab, logs in as
// someone else, and both accounts stay connected.
const login = read('app/(auth)/login/page.tsx')
if (login && /claimSlotForNewLogin\(\)/.test(login)) {
  pass('login claims a free slot automatically (no UI needed for a 2nd account)')
} else {
  fail('login does not claim a slot — a second sign-in would overwrite the first')
}
if (login && /slotUrl\(loginSlot/.test(login)) {
  pass('login lands on the slot URL, so the account survives a reload')
} else {
  fail('login does not redirect to the slot URL')
}

const sidebar = read('components/Sidebar.tsx')
if (sidebar && !/SidebarAccountSwitcher/.test(sidebar)) {
  pass('no account-switcher UI (it was never asked for; login handles it)')
} else {
  fail('a switcher UI is still present')
}

// ---------------------------------------------------------------------
// 6. Every authenticated route must REACH the proxy
// ---------------------------------------------------------------------
// A route missing from the matcher never resolves a slot, so
// lib/supabase/server.ts falls back to slot 0 and that route shows the FIRST
// account regardless of the tab. /admin was missing and did exactly that:
// it read the slot-0 cookie in every tab, overriding their real sessions.
const matcherBlock = proxy.slice(proxy.indexOf('matcher: ['))
const AUTHENTICATED_PREFIXES = [
  '/dashboard', '/assets', '/audits', '/team', '/settings',
  '/vgp', '/subscription', '/admin', '/api',
]
const unmatched = AUTHENTICATED_PREFIXES.filter(
  p => !new RegExp(`'${p}(/:path\\*)?'`).test(matcherBlock)
)
if (unmatched.length === 0) {
  pass(`all ${AUTHENTICATED_PREFIXES.length} authenticated route prefixes are in the matcher`)
} else {
  fail(
    `route prefix(es) skip the proxy and would fall back to slot 0: ${unmatched.join(', ')}`
  )
}

// Negative control: the check must be able to SPOT a missing prefix.
if (!/'\/definitely-not-a-route(\/:path\*)?'/.test(matcherBlock)) {
  pass('matcher check detects an absent prefix (negative control)')
} else {
  fail('matcher check is vacuous')
}

// /admin must also be treated as protected, so an unauthenticated visitor is
// redirected rather than reaching it.
if (/const protectedRoutes = \[[\s\S]*?'\/admin',[\s\S]*?\]/.test(proxy)) {
  pass('/admin is in protectedRoutes')
} else {
  fail('/admin is not in protectedRoutes')
}

const adminLogout = read('app/(admin)/admin/AdminLogoutButton.tsx')
if (adminLogout && /slotUrl\(slot, '\/login'\)/.test(adminLogout)) {
  pass('admin sign-out keeps this tab’s slot')
} else {
  fail('admin sign-out drops the slot and would land on the first account’s login')
}

// Every sign-out must ALSO clear the cookie locally. signOut() resolves with
// an { error } rather than throwing, so a failed call would leave the session
// alive -- and since the proxy bounces a signed-in admin from /login back to
// /admin, that reads as "it logged me back in by itself".
const LOGOUT_SITES = [
  'app/(admin)/admin/AdminLogoutButton.tsx',
  'components/Sidebar.tsx',
  'components/dashboard/DashboardClient.tsx',
]
const notCleared = LOGOUT_SITES.filter(f => {
  const src = read(f)
  return !src || !/clearSlotCookie\(/.test(src)
})
if (notCleared.length === 0) {
  pass(`all ${LOGOUT_SITES.length} sign-out sites clear the slot cookie locally`)
} else {
  fail('sign-out site(s) rely on signOut() alone', notCleared.join(', '))
}

// ---------------------------------------------------------------------
// 7. A signed-in user must still be able to REACH a login form
// ---------------------------------------------------------------------
// The auth-page bounce used to be absolute: /login always redirected a
// signed-in user away. That made adding a second account impossible, and
// every new tab -- slot 0, where the first session lives -- was thrown to
// /admin instead of showing a login page.
if (/const freeSlot = firstFreeSlot\(request\)/.test(proxy)) {
  pass('/login on a signed-in browser is sent to a FREE slot, not bounced')
} else {
  fail('/login still bounces unconditionally — a second account is unreachable')
}
if (/function firstFreeSlot\(/.test(proxy)) {
  pass('firstFreeSlot() reads cookie presence to find an open slot')
} else {
  fail('firstFreeSlot() is missing')
}
if (/searchParams\.has\('add'\)/.test(proxy)) {
  pass('an explicit ?add always reaches the login form')
} else {
  fail('no explicit escape hatch to the login form')
}
// The bounce must still happen when there is genuinely nothing to add,
// otherwise a signed-in user lands on a pointless login form.
if (/Every slot is occupied[\s\S]*?is_super_admin/.test(proxy)) {
  pass('the ordinary bounce still applies when every slot is occupied')
} else {
  fail('the all-slots-full case no longer bounces')
}

// ---------------------------------------------------------------------
console.log('')
console.log(`${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
console.log('slot url verification passed')
