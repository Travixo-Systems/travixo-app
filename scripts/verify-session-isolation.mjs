#!/usr/bin/env node
/**
 * verify-session-isolation.mjs
 *
 * Every Supabase client in the app must name its auth cookie the same way.
 *
 * WHY THIS IS LOAD-BEARING
 *
 * @supabase/ssr derives the cookie name from the project ref when
 * cookieOptions.name is absent. This repo builds Supabase clients in 15
 * separate places -- 12 API routes carry their own private copy of
 * createClient() rather than importing the shared helper. If even ONE of
 * them keeps the library default while the rest are pinned, that route
 * reads a DIFFERENT cookie: the user is signed in everywhere except there.
 * That failure is silent and route-specific, which is the hardest kind to
 * report.
 *
 * So this script does not check "the helpers were updated". It enumerates
 * EVERY createServerClient/createBrowserClient construction site in the
 * repo and requires each one to carry the shared options.
 *
 * Prints "session isolation verification passed" only when every case holds.
 */

import { pathToFileURL } from 'url'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 400)}`)
}

// ---------------------------------------------------------------------
// 1. The shared constant
// ---------------------------------------------------------------------
const CN = 'lib/supabase/cookie-name.ts'
if (!existsSync(CN)) {
  console.log(`FAIL  ${CN} missing`)
  process.exit(1)
}
let cn
try {
  cn = await import(pathToFileURL(resolve(CN)).href)
} catch (err) {
  console.log(`FAIL  cannot import ${CN}: ${err?.message}`)
  process.exit(1)
}

if (typeof cn.AUTH_COOKIE_NAME === 'string' && cn.AUTH_COOKIE_NAME.length > 0) {
  pass(`AUTH_COOKIE_NAME is "${cn.AUTH_COOKIE_NAME}"`)
} else {
  fail('AUTH_COOKIE_NAME missing or empty')
}
if (cn.AUTH_COOKIE_OPTIONS?.name === cn.AUTH_COOKIE_NAME) {
  pass('AUTH_COOKIE_OPTIONS.name matches AUTH_COOKIE_NAME')
} else {
  fail('AUTH_COOKIE_OPTIONS.name does not match AUTH_COOKIE_NAME')
}

// The name must NOT look like the library default, or pinning it achieves
// nothing and a future reader will think it is inherited.
if (!/^sb-.*-auth-token$/.test(cn.AUTH_COOKIE_NAME)) {
  pass('the pinned name is distinct from the library default pattern')
} else {
  fail(`AUTH_COOKIE_NAME "${cn.AUTH_COOKIE_NAME}" mimics the library default`)
}

// ---------------------------------------------------------------------
// 2. Enumerate EVERY construction site
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

// A construction site is a call to createServerClient(/createBrowserClient(.
// For each, take the following ~40 lines as its options region and require
// AUTH_COOKIE_OPTIONS (or an explicit cookieOptions name) within it.
const sites = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const lines = src.split(/\r?\n/)
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*')) return
    if (!/\b(createServerClient|createBrowserClient)\s*[<(]/.test(line)) return
    // Skip the import statement itself.
    if (/^import\b/.test(t)) return
    const region = lines.slice(i, i + 40).join('\n')
    sites.push({ file: f, line: i + 1, region })
  })
}

if (sites.length > 0) {
  pass(`found ${sites.length} Supabase client construction site(s)`)
} else {
  fail('found NO construction sites — the scan is broken, not the code')
}

// Every site must pin the cookie name.
const unpinned = []
for (const s of sites) {
  const pinned =
    /cookieOptions:\s*(AUTH_COOKIE_OPTIONS|cookieOptionsForSlot|slotCookieOptions)/.test(s.region) ||
    /cookieOptions:\s*\{[^}]*name\s*:/.test(s.region)
  if (!pinned) unpinned.push(`${s.file}:${s.line}`)
}

if (unpinned.length === 0) {
  pass(`all ${sites.length} construction sites pin the auth cookie name`)
} else {
  fail(
    `${unpinned.length} construction site(s) fall back to the library default cookie`,
    unpinned.join('\n      ')
  )
}

// Negative control: the pinning regex must be able to REJECT something.
const controlRegion = `createServerClient(
    url,
    key,
    {
      cookies: { getAll() {}, setAll() {} },
    }
  )`
const controlPinned =
  /cookieOptions:\s*AUTH_COOKIE_OPTIONS/.test(controlRegion) ||
  /cookieOptions:\s*\{[^}]*name\s*:/.test(controlRegion)
if (!controlPinned) {
  pass('pinning check rejects an unpinned control site (negative control)')
} else {
  fail('pinning check ACCEPTED an unpinned control — the check is vacuous')
}

// ---------------------------------------------------------------------
// 3. The three chokepoints specifically
// ---------------------------------------------------------------------
// These decide identity for the whole app, so name them explicitly rather
// than relying on the sweep above to have covered them.
const CHOKEPOINTS = [
  ['proxy.ts', 'gates every protected route'],
  ['lib/supabase/server.ts', 'every server component'],
  ['lib/supabase/client.ts', 'every client component'],
]
for (const [f, why] of CHOKEPOINTS) {
  const src = existsSync(f) ? readFileSync(f, 'utf8') : null
  if (!src) { fail(`${f} missing`); continue }
  // Either the fixed Phase 1 constant or the Phase 2 per-slot resolver counts:
  // both pin the name to something this repo owns rather than the library
  // default. Phase 2 replaced the constant with cookieOptionsForSlot(...).
  if (/AUTH_COOKIE_OPTIONS|cookieOptionsForSlot|slotCookieOptions/.test(src)) {
    pass(`${f} pins the cookie (${why})`)
  } else {
    fail(`${f} does NOT pin the cookie (${why})`)
  }
}

// ---------------------------------------------------------------------
// 4. Honest scope statement
// ---------------------------------------------------------------------
// This change does NOT deliver two different accounts at once. Assert the
// module says so, so nobody reads the fix as more than it is.
const cnSrc = readFileSync(CN, 'utf8')
if (/account-slot/.test(cnSrc) && /ONE name holds ONE\s*\n\/\/ session|one name holds one session/i.test(cnSrc)) {
  pass('cookie-name.ts explains its scope and points at account-slot.ts for multi-account')
} else {
  fail('cookie-name.ts does not state its scope relative to the slot scheme')
}

// ---------------------------------------------------------------------
console.log('')
console.log(`${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
console.log('session isolation verification passed')
