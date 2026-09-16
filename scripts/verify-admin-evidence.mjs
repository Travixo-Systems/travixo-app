#!/usr/bin/env node
/**
 * verify-admin-evidence.mjs
 *
 * Static gates for the /admin/evidence surface (GATES-ADMIN-EVIDENCE.md E1-E5).
 *
 * The property worth protecting is that a detector reporting ZERO is
 * distinguishable from a detector that DID NOT RUN. Both look identical in a
 * naive implementation, and the second is the one that quietly stops
 * protecting anything. E3 asserts the distinction exists in both the detectors
 * and the view.
 *
 * Prints "admin evidence verification passed" only when every check holds.
 */

import { readFileSync, existsSync, readdirSync } from 'fs'

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 400)}`)
}

const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : null)

const EVIDENCE_DIR = 'lib/admin/evidence'
const PAGE = 'app/(admin)/admin/evidence/page.tsx'
const VIEW = 'app/(admin)/admin/evidence/AdminEvidenceView.tsx'
const LAYOUT = 'app/(admin)/admin/layout.tsx'
const I18N = 'lib/i18n.ts'

const DETECTORS = ['atomicDisagreement.ts', 'documentaryGaps.ts', 'rentalExpiry.ts']

// ---------------------------------------------------------------------
// E1: every detector is a pure read
// ---------------------------------------------------------------------
// PostgREST writes are method calls, so they are detectable by name. An RPC is
// listed too: record_inspection() and the admin functions all write, so any
// .rpc( under this directory is a failure regardless of which one it names.
const WRITE_CALLS = /\.(insert|update|upsert|delete)\s*\(|\.rpc\s*\(/

if (!existsSync(EVIDENCE_DIR)) {
  fail(`${EVIDENCE_DIR} does not exist`)
} else {
  const files = readdirSync(EVIDENCE_DIR).filter(f => f.endsWith('.ts'))
  const missing = DETECTORS.filter(d => !files.includes(d))
  if (missing.length === 0) pass(`all ${DETECTORS.length} detectors present, each in its own file`)
  else fail('detector file(s) missing', missing.join(', '))

  const writers = []
  for (const f of files) {
    const src = readFileSync(`${EVIDENCE_DIR}/${f}`, 'utf8')
    // Strip comments: prose about writes is not a write.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    if (WRITE_CALLS.test(code)) writers.push(f)
  }
  if (writers.length === 0) pass('no detector performs a write (insert/update/upsert/delete/rpc)')
  else fail('detector(s) contain a write call', writers.join(', '))
}

const pageSrc = read(PAGE)
const viewSrc = read(VIEW)

if (pageSrc) {
  const code = pageSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  if (!WRITE_CALLS.test(code)) pass('the page performs no write')
  else fail('the page contains a write call')
} else {
  fail(`${PAGE} not found`)
}

if (viewSrc) {
  const code = viewSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  if (!WRITE_CALLS.test(code) && !/from\s*\(/.test(code)) {
    pass('the client island performs no query and no write')
  } else {
    fail('the client island queries or writes; it must render server-computed rows only')
  }
} else {
  fail(`${VIEW} not found`)
}

// ---------------------------------------------------------------------
// E2: the route is gated
// ---------------------------------------------------------------------
const layoutSrc = read(LAYOUT)
if (layoutSrc && /requireSuperAdmin\s*\(/.test(layoutSrc)) {
  pass('admin layout calls requireSuperAdmin(), which gates /admin/evidence')
} else {
  fail('admin layout does not call requireSuperAdmin()')
}

// The page must not introduce a WEAKER check of its own. A tenant role pair
// here would be the same defect the trigger-vgp-alerts route carried.
if (pageSrc && /\[['"]admin['"],\s*['"]owner['"]\]|\[['"]owner['"],\s*['"]admin['"]\]/.test(pageSrc)) {
  fail('the evidence page authorises on a tenant role')
} else {
  pass('the evidence page adds no tenant-role check of its own')
}

// The nav moved out of layout.tsx into AdminNav.tsx when the console gained a
// top nav with an active state (which needs usePathname, so a client
// component). The property worth asserting is that the link EXISTS in the
// nav, not which file the nav happens to live in, so both are checked.
// Matches both spellings: the JSX attribute href="/admin/evidence" and the
// data-driven form { href: '/admin/evidence', ... } that a nav built from a
// list uses. Asserting only the first would pass a hardcoded link and fail a
// perfectly good array, which is a property of the regex rather than of the
// nav.
const navSrc = read('app/(admin)/admin/AdminNav.tsx')
const EVIDENCE_LINK = /href[:=]\s*["']\/admin\/evidence["']/
const navCarriesLink = [layoutSrc, navSrc].some((src) => src && EVIDENCE_LINK.test(src))

if (navCarriesLink) {
  pass('/admin/evidence is linked from the admin nav')
} else {
  fail('/admin/evidence is not linked from the admin nav (checked layout.tsx and AdminNav.tsx)')
}

// ---------------------------------------------------------------------
// E3: a failed detector never renders as clean
// ---------------------------------------------------------------------
let allHaveFailed = true
for (const d of DETECTORS) {
  const src = read(`${EVIDENCE_DIR}/${d}`)
  if (!src || !/failed:\s*true/.test(src) || !/failed:\s*false/.test(src)) {
    allHaveFailed = false
    fail(`${d} does not return both failed:true and failed:false`)
  }
}
if (allHaveFailed) pass('every detector distinguishes a failed run from an empty one')

if (viewSrc) {
  // The view must branch on .failed BEFORE it branches on rows.length, or a
  // broken detector renders the green line.
  const ok = ['d1', 'd2', 'd3'].every(k => {
    const failedAt = viewSrc.indexOf(`${k}.failed`)
    const lenAt = viewSrc.indexOf(`${k}.rows.length === 0`)
    return failedAt !== -1 && lenAt !== -1 && failedAt < lenAt
  })
  if (ok) pass('the view tests failed before empty for all three detectors')
  else fail('the view can render a failed detector as clean')

  if (/CleanLine/.test(viewSrc) && /FailedLine/.test(viewSrc)) {
    pass('distinct clean and failed states exist in the view')
  } else {
    fail('the view lacks a distinct clean or failed state')
  }
}

// ---------------------------------------------------------------------
// E4: i18n complete, en and fr, no hardcoded English
// ---------------------------------------------------------------------
const i18nSrc = read(I18N)
if (!i18nSrc) {
  fail(`${I18N} not found`)
} else {
  const ns = i18nSrc.match(/adminEvidence:\s*\{[\s\S]*?\n {2}\},/)
  if (!ns) {
    fail('lib/i18n.ts has no adminEvidence namespace')
  } else {
    const block = ns[0]
    const keys = [...block.matchAll(/^\s{4}([a-zA-Z0-9]+):\s*\{/gm)].map(m => m[1])
    const en = (block.match(/\ben:\s*["'`]/g) || []).length
    const fr = (block.match(/\bfr:\s*["'`]/g) || []).length
    if (keys.length > 0 && en === fr && en >= keys.length) {
      pass(`adminEvidence namespace: ${keys.length} keys, ${en} en / ${fr} fr`)
    } else {
      fail(`adminEvidence en/fr mismatch: ${keys.length} keys, ${en} en, ${fr} fr`)
    }
  }

  if (viewSrc) {
    const used = [...viewSrc.matchAll(/t\('adminEvidence\.([a-zA-Z0-9]+)'\)/g)].map(m => m[1])
    const uniq = [...new Set(used)]
    const absent = uniq.filter(k => !new RegExp(`\\b${k}:\\s*\\{`).test(i18nSrc))
    if (uniq.length > 0 && absent.length === 0) {
      pass(`all ${uniq.length} adminEvidence keys used by the view exist in lib/i18n.ts`)
    } else {
      fail('the view references adminEvidence keys that do not exist', absent.join(', '))
    }
  }
}

// No messages/*.json: translations live in lib/i18n.ts only.
if (!existsSync('messages')) pass('no messages/ directory; lib/i18n.ts is the only translation source')
else fail('a messages/ directory exists; translations must live in lib/i18n.ts')

// ---------------------------------------------------------------------
// E5: D1 states its rule, and names the rule it deliberately does not use
// ---------------------------------------------------------------------
const d1Src = read(`${EVIDENCE_DIR}/atomicDisagreement.ts`)
if (d1Src) {
  const hasRuleA = /RULE A/.test(d1Src)
  const hasRuleB = /RULE B/.test(d1Src)
  const hasExcluded = /last_inspection_date/.test(d1Src) && /reseed/i.test(d1Src)
  if (hasRuleA && hasRuleB) pass('D1 states both rules in the source')
  else fail('D1 does not state its rules')
  if (hasExcluded) pass('D1 names the last_inspection_date rule it deliberately excludes')
  else fail('D1 does not explain the excluded rule')
}

if (i18nSrc && /d1RuleExcluded:/.test(i18nSrc)) {
  pass('the excluded rule is surfaced to the reader, not only in a code comment')
} else {
  fail('the excluded rule is not surfaced in the UI')
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nadmin evidence verification passed')
