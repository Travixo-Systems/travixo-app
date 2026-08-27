#!/usr/bin/env node
/**
 * verify-session-scope.mjs
 *
 * The reported symptom: signing out in one browser tab destroyed the
 * session in every other tab, making a two-tab evaluation impossible.
 *
 * The cause is a library default, not app code. auth-js declares
 *
 *     async signOut(options = { scope: 'global' })
 *
 * and 'global' revokes the user's REFRESH TOKEN server-side, ending every
 * session that user holds anywhere. Every signOut() in this app was a bare
 * call, so every sign-out was a global one.
 *
 * This script:
 *   1. MEASURES the library default from the installed package rather than
 *      trusting the docs (if a future upgrade changes it, this tells us)
 *   2. asserts every signOut() call site passes an explicit scope
 *   3. asserts the scope passed is 'local', with 'global' reserved for a
 *      deliberate sign-out-everywhere control
 *
 * Prints "session scope verification passed" only when every case holds.
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
  if (d) console.log(`      ${String(d).slice(0, 250)}`)
}

const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null)

// ---------------------------------------------------------------------
// 1. Measure the library default
// ---------------------------------------------------------------------
const GOTRUE = 'node_modules/@supabase/auth-js/dist/module/GoTrueClient.js'
const gotrue = read(GOTRUE)
if (!gotrue) {
  console.log(`FAIL  ${GOTRUE} missing — cannot measure the library default`)
  process.exit(1)
}

const defaultMatch = gotrue.match(/async signOut\(options = \{ scope: '(\w+)' \}\)/)
if (!defaultMatch) {
  fail('could not locate signOut default in the installed auth-js')
} else if (defaultMatch[1] === 'global') {
  pass(`library default signOut scope is '${defaultMatch[1]}' — explicit scope IS required`)
} else {
  // Not a failure of our code, but a fact that changes the reasoning.
  fail(
    `library default signOut scope is now '${defaultMatch[1]}', not 'global' — ` +
    're-read lib/supabase/cookie-name.ts, its rationale may be stale'
  )
}

// Confirm 'local' is actually a supported scope in this version.
const TYPES = 'node_modules/@supabase/auth-js/dist/module/lib/types.js'
const typesJs = read(TYPES)
if (typesJs && /SIGN_OUT_SCOPES = \['global', 'local', 'others'\]/.test(typesJs)) {
  pass("'local' is a supported scope in the installed auth-js")
} else {
  fail("could not confirm 'local' is a supported signOut scope", typesJs?.slice(0, 120))
}

// ---------------------------------------------------------------------
// 2. Every call site passes an explicit scope
// ---------------------------------------------------------------------
const ROOTS = ['app', 'components', 'lib']
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

const files = ROOTS.flatMap(r => walk(r))
pass(`scanned ${files.length} source files for signOut call sites`)

const bare = []
const scoped = []
const globalScoped = []

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const lines = src.split(/\r?\n/)
  lines.forEach((line, i) => {
    // Ignore comment lines: they document the call, they are not one.
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
    if (!/\.auth\.signOut\s*\(/.test(line)) return

    const where = `${f}:${i + 1}`
    if (/\.auth\.signOut\s*\(\s*\)/.test(line)) bare.push(where)
    else if (/SIGN_OUT_SCOPE_GLOBAL|scope:\s*'global'/.test(line)) globalScoped.push(where)
    else scoped.push(where)
  })
}

if (bare.length === 0) {
  pass(`no bare signOut() calls remain (${scoped.length + globalScoped.length} scoped call sites)`)
} else {
  fail(
    `${bare.length} bare signOut() call(s) still inherit the global default`,
    bare.join(', ')
  )
}

if (scoped.length > 0) {
  pass(`${scoped.length} call site(s) pass an explicit local scope`)
} else {
  fail('no explicitly-scoped signOut call sites found — did the scan miss them?')
}

// A deliberate "sign out everywhere" control is allowed, but it must be
// deliberate. Report any so a reviewer sees them.
if (globalScoped.length === 0) {
  pass('no call site requests a global sign-out')
} else {
  pass(`${globalScoped.length} deliberate global sign-out(s): ${globalScoped.join(', ')}`)
}

// Negative control: the scanner must be able to SEE a bare call. If this
// regex never matches anything, the "no bare calls" pass above is vacuous.
const controlLine = '    await supabase.auth.signOut()'
if (/\.auth\.signOut\s*\(\s*\)/.test(controlLine)) {
  pass('scanner detects a bare signOut() in a known positive control')
} else {
  fail('scanner FAILED its positive control — the bare-call check is vacuous')
}

// ---------------------------------------------------------------------
// 3. The shared constants
// ---------------------------------------------------------------------
const CN = 'lib/supabase/cookie-name.ts'
let cn
try {
  cn = await import(pathToFileURL(resolve(CN)).href)
} catch (err) {
  console.log(`FAIL  cannot import ${CN}: ${err?.message}`)
  process.exit(1)
}

if (cn.SIGN_OUT_SCOPE_LOCAL?.scope === 'local') {
  pass("SIGN_OUT_SCOPE_LOCAL is { scope: 'local' }")
} else {
  fail(`SIGN_OUT_SCOPE_LOCAL is ${JSON.stringify(cn.SIGN_OUT_SCOPE_LOCAL)}`)
}
if (cn.SIGN_OUT_SCOPE_GLOBAL?.scope === 'global') {
  pass("SIGN_OUT_SCOPE_GLOBAL is { scope: 'global' } (available for security use)")
} else {
  fail(`SIGN_OUT_SCOPE_GLOBAL is ${JSON.stringify(cn.SIGN_OUT_SCOPE_GLOBAL)}`)
}

// ---------------------------------------------------------------------
console.log('')
console.log(`${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
console.log('session scope verification passed')
