#!/usr/bin/env node
/**
 * verify-multiaccount-wiring.mjs
 *
 * The slot mapping being correct (verify-multiaccount.mjs) is worth nothing
 * if the app does not USE it everywhere. This checks the wiring:
 *
 *   browser tab  -> sessionStorage slot
 *                -> x-travixo-account header on every same-origin fetch
 *   proxy.ts     -> validates it, picks the cookie, forwards the RESOLVED
 *                   slot on a separate header
 *   server code  -> reads the RESOLVED header (never the inbound one)
 *
 * A single construction site left on a fixed cookie name would read the wrong
 * account on exactly those routes, silently.
 *
 * Prints "multiaccount wiring verification passed" only when every case holds.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 400)}`)
}

const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null)

// ---------------------------------------------------------------------
// 1. proxy.ts
// ---------------------------------------------------------------------
const proxy = read('proxy.ts')
if (!proxy) {
  console.log('FAIL  proxy.ts missing')
  process.exit(1)
}

const proxyChecks = [
  ['reads the inbound slot header', /request\.headers\.get\(ACCOUNT_SLOT_HEADER\)/],
  ['validates it through parseSlot', /parseSlot\(/],
  // The URL is the fix for the reported reload bug: it is per-tab and the
  // browser resends it on reload, which a browser-wide cookie can never be.
  ['resolves the slot from the URL prefix', /splitSlotPath\(rawPathname\)/],
  ['rewrites the stripped path so app routes are unchanged', /NextResponse\.rewrite\(rewriteUrl/],
  ['keeps the slot prefix on redirects', /withSlotPath\(slot,/],
  ['derives cookie options from the slot', /cookieOptionsForSlot\(slot\)/],
  ['forwards the RESOLVED slot to server components', /requestHeaders\.set\(RESOLVED_SLOT_HEADER/],
  ['passes slot-derived options to the Supabase client', /cookieOptions: slotCookieOptions/],
]
for (const [label, re] of proxyChecks) {
  if (re.test(proxy)) pass(`proxy ${label}`)
  else fail(`proxy does not ${label}`)
}

// The proxy must never hand the RAW inbound value to cookieOptionsForSlot.
if (/cookieOptionsForSlot\(\s*request\.headers\.get/.test(proxy)) {
  fail('proxy passes the raw inbound header into cookieOptionsForSlot without parseSlot')
} else {
  pass('proxy never passes the raw inbound header straight into cookie resolution')
}

// Every NextResponse.next({request:{headers}}) must forward requestHeaders,
// not the original request.headers -- otherwise the resolved slot is dropped
// on any response rebuilt during a token refresh.
const staleForwards = (proxy.match(/headers: request\.headers/g) ?? []).length
if (staleForwards === 0) {
  const forwards = (proxy.match(/headers: requestHeaders/g) ?? []).length
  pass(`all ${forwards} response rebuild(s) forward the resolved headers`)
} else {
  fail(`${staleForwards} response rebuild(s) still forward the original headers, dropping the resolved slot`)
}

// ---------------------------------------------------------------------
// 2. Every Supabase construction site is slot-aware
// ---------------------------------------------------------------------
const ROOTS = ['app', 'lib', 'components']
const EXTRA = ['proxy.ts']
const SKIP = new Set(['node_modules', '.next', '.git'])

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const e of entries) {
    if (SKIP.has(e)) continue
    const p = join(dir, e)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e)) out.push(p)
  }
  return out
}

const files = [...ROOTS.flatMap(r => walk(r)), ...EXTRA.filter(existsSync)]
const sites = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const lines = src.split(/\r?\n/)
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || /^import\b/.test(t)) return
    if (!/\b(createServerClient|createBrowserClient)\s*[<(]/.test(line)) return
    sites.push({ file: f, line: i + 1, region: lines.slice(i, i + 40).join('\n') })
  })
}

if (sites.length >= 15) {
  pass(`found ${sites.length} Supabase client construction site(s)`)
} else {
  fail(`found only ${sites.length} construction sites — expected at least 15, scan may be broken`)
}

const notSlotAware = sites.filter(
  s => !/cookieOptions:\s*(cookieOptionsForSlot|slotCookieOptions)/.test(s.region)
)
if (notSlotAware.length === 0) {
  pass(`all ${sites.length} construction sites derive the cookie from the request/tab slot`)
} else {
  fail(
    `${notSlotAware.length} construction site(s) use a FIXED cookie name and would read the wrong account`,
    notSlotAware.map(s => `${s.file}:${s.line}`).join('\n      ')
  )
}

// Negative control: the slot-aware regex must reject a fixed-name site.
const control = `createServerClient(url, key, {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {},
    })`
if (!/cookieOptions:\s*(cookieOptionsForSlot|slotCookieOptions)/.test(control)) {
  pass('slot-aware check rejects a fixed-cookie control site (negative control)')
} else {
  fail('slot-aware check ACCEPTED a fixed-cookie control — the check is vacuous')
}

// ---------------------------------------------------------------------
// 3. Server code reads the RESOLVED header, never the inbound one
// ---------------------------------------------------------------------
const serverFiles = files.filter(f => !f.startsWith('components') && !/client\.ts$/.test(f))
const trustsInbound = []
for (const f of serverFiles) {
  const src = readFileSync(f, 'utf8')
  if (f === 'proxy.ts') continue // the proxy is the one place that MAY read it
  if (/headers\(\)\)?\.get\(ACCOUNT_SLOT_HEADER\)/.test(src)) trustsInbound.push(f)
}
if (trustsInbound.length === 0) {
  pass('no server module reads the unvalidated inbound slot header (only proxy.ts may)')
} else {
  fail('server module(s) trust the unvalidated inbound header', trustsInbound.join(', '))
}

const server = read('lib/supabase/server.ts')
if (server && /RESOLVED_SLOT_HEADER/.test(server) && /cookieOptionsForSlot/.test(server)) {
  pass('lib/supabase/server.ts resolves the cookie from the RESOLVED header')
} else {
  fail('lib/supabase/server.ts is not slot-aware')
}
if (server && /catch\s*\{/.test(server)) {
  pass('server.ts tolerates headers() being unavailable (prerender/outside request scope)')
} else {
  fail('server.ts does not guard headers() — it throws outside a request scope')
}

// ---------------------------------------------------------------------
// 4. The browser side
// ---------------------------------------------------------------------
const client = read('lib/supabase/client.ts')
if (!client) {
  fail('lib/supabase/client.ts missing')
} else {
  const clientChecks = [
    ['stores the slot in sessionStorage (per-tab)', /sessionStorage/],
    ['wraps fetch once, idempotently', /__travixoSlotFetch/],
    ['sets the slot header on same-origin requests', /headers\.set\(ACCOUNT_SLOT_HEADER/],
    ['leaves cross-origin requests untouched', /if \(!sameOrigin\) return original/],
    ['disables the ssr singleton', /isSingleton: false/],
    ['caches one client per slot', /clientsBySlot/],
    ['keeps client navigation on the slot prefix', /installSlotHistoryGuard/],
  ]
  for (const [label, re] of clientChecks) {
    if (re.test(client)) pass(`client ${label}`)
    else fail(`client does not ${label}`)
  }

  // The per-tab store must not be localStorage — that would be per-browser
  // and every tab would share one slot, defeating the feature.
  if (/localStorage\.(get|set)Item\(\s*SLOT_STORAGE_KEY/.test(client)) {
    fail('client stores the slot in localStorage — that is per-browser, not per-tab')
  } else {
    pass('client does not store the slot in localStorage (would be per-browser)')
  }
}

// ---------------------------------------------------------------------
// 5. Bootstrap is actually mounted
// ---------------------------------------------------------------------
const layout = read('app/layout.tsx')
if (layout && /<AccountSlotBootstrap\s*\/>/.test(layout)) {
  pass('AccountSlotBootstrap is mounted in the root layout')
} else {
  fail('AccountSlotBootstrap is NOT mounted — the fetch wrapper never installs')
}

const boot = read('components/AccountSlotBootstrap.tsx')
if (!boot) {
  fail('components/AccountSlotBootstrap.tsx missing')
} else {
  const bootChecks = [
    ['installs the fetch wrapper', /installAccountSlotFetch\(\)/],
    // The history guard replaced the old focus/visibility republishing, which
    // existed only to keep a browser-wide hint cookie fresh. That cookie was
    // the reload bug; the URL prefix needs no upkeep.
    ['installs the history guard so links keep the slot prefix', /installSlotHistoryGuard\(\)/],
  ]
  for (const [label, re] of bootChecks) {
    if (re.test(boot)) pass(`bootstrap ${label}`)
    else fail(`bootstrap does not ${label}`)
  }
}

// A switcher must exist, or the feature is unreachable by a user.
// No switcher: a second tab signing in gets its own slot automatically.
const login = read('app/(auth)/login/page.tsx')
if (login && /claimSlotForNewLogin/.test(login)) {
  pass('a second tab signing in claims its own slot automatically')
} else {
  fail('login does not claim a slot — a second account would overwrite the first')
}

// ---------------------------------------------------------------------
console.log('')
console.log(`${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
console.log('multiaccount wiring verification passed')
