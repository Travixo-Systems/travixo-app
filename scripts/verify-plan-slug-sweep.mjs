#!/usr/bin/env node
/**
 * verify-plan-slug-sweep.mjs
 *
 * Fails if a retired plan slug appears in a COMPARISON anywhere in the
 * repository, outside lib/admin/featureFlags.ts.
 *
 * WHY THIS EXISTS
 *
 * The four-tier plan model is gone; one plan carries everything. Four separate
 * sweeps for surviving slug literals each reported complete, and each time
 * another instance turned up afterwards. The cause was the same every time:
 * the sweep used glob filters (--include='*.ts', or a path list) that excluded
 * docs/, scripts/, supabase/ or generated types, so the search could not see
 * what it claimed to have checked.
 *
 * This enumerates with `git ls-files` and NO glob filters. Every tracked file
 * is read.
 *
 * WHAT COUNTS AS A VIOLATION
 *
 * Only a COMPARISON: an equality test, an includes()/indexOf() membership
 * test, a switch case, or a SQL `slug = '...'` / `slug IN (...)`. A slug
 * appearing in prose, a comment, or a seed value is not a violation -- the
 * model is retired, not unmentionable, and historical migrations must keep
 * saying what they did.
 *
 * Run with --self-test to prove the detector can fail.
 */

import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'

const SLUGS = ['starter', 'professional', 'business', 'enterprise']

/** Admin tooling. ALLOWED_PLAN_SLUGS is the list of historical slugs, by design. */
const EXEMPT = new Set(['lib/admin/featureFlags.ts'])

/** Binary and lockfile extensions worth skipping: no comparisons live there. */
const SKIP_EXT = /\.(png|jpg|jpeg|gif|webp|ico|svg|pdf|woff2?|ttf|eot|mp4|zip|xlsx?|lock)$/i

const S = SLUGS.join('|')

/**
 * Comparison shapes, deliberately narrow. Each requires the slug to sit in a
 * position where a decision is being made about it.
 */
const PATTERNS = [
  // JS/TS equality:  === 'starter'   !== "professional"   == 'business'
  { name: 'equality', re: new RegExp(`[!=]==?\\s*['"\`](${S})['"\`]`, 'g') },
  // reversed:        'starter' === x
  { name: 'equality', re: new RegExp(`['"\`](${S})['"\`]\\s*[!=]==?`, 'g') },
  // membership:      ['starter', ...].includes(x)   .indexOf('starter')
  { name: 'membership', re: new RegExp(`\\.(?:includes|indexOf)\\(\\s*['"\`](${S})['"\`]`, 'g') },
  // array literal immediately followed by .includes( -- the allowlist shape
  { name: 'allowlist', re: new RegExp(`\\[[^\\]]*['"\`](${S})['"\`][^\\]]*\\]\\s*\\.\\s*includes`, 'g') },
  // switch case:     case 'starter':
  { name: 'switch-case', re: new RegExp(`case\\s+['"\`](${S})['"\`]\\s*:`, 'g') },
  // SQL equality:    slug = 'starter'   tier='professional'
  { name: 'sql-equality', re: new RegExp(`\\b(?:slug|subscription_tier|tier)\\s*=\\s*'(${S})'`, 'gi') },
  // SQL membership:  slug IN ('starter', ...)
  { name: 'sql-in', re: new RegExp(`\\bIN\\s*\\([^)]*'(${S})'`, 'gi') },
  // PostgREST filter: slug=eq.starter
  { name: 'postgrest-eq', re: new RegExp(`(?:slug|subscription_tier)=eq\\.(${S})\\b`, 'g') },
]

/**
 * Records rather than logic, reported as INERT rather than as violations:
 *
 *   supabase/migrations/  a migration is a record of what was applied.
 *                         Rewriting one to remove a slug would falsify it.
 *   docs/                 documentation of the retired model. The tiers
 *                         existed; describing them is not a decision.
 *
 * Deliberately narrow. The schema MIRROR (supabase/schemas/) is excluded from
 * this list on purpose: it reflects live database objects, so a slug compared
 * there is a real violation.
 */
const INERT_PATH = /^(?:supabase\/migrations|docs)\//

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return out.split('\0').filter(Boolean)
}

function scan(files) {
  const violations = []
  const inert = []
  for (const file of files) {
    if (EXEMPT.has(file)) continue
    if (SKIP_EXT.test(file)) continue
    if (file === 'scripts/verify-plan-slug-sweep.mjs') continue // this file defines the patterns
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (!SLUGS.some((s) => text.includes(s))) continue

    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const { name, re } of PATTERNS) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(line)) !== null) {
          const hit = { file, line: i + 1, slug: m[1], kind: name, text: line.trim().slice(0, 120) }
          if (INERT_PATH.test(file)) inert.push(hit)
          else violations.push(hit)
        }
      }
    }
  }
  return { violations, inert }
}

// --- self-test: prove the detector can fail --------------------------------
if (process.argv.includes('--self-test')) {
  const probe = 'scripts/__slug_sweep_probe.ts'
  const cases = [
    { label: 'equality', body: `const x = plan === 'professional'\n` },
    { label: 'allowlist', body: `const ok = ['starter','business'].includes(slug)\n` },
    { label: 'switch-case', body: `switch (s) { case 'enterprise': break }\n` },
    { label: 'sql-equality', body: `-- WHERE slug = 'starter'\n` },
  ]
  let failures = 0
  for (const c of cases) {
    writeFileSync(probe, c.body, 'utf8')
    try {
      const { violations } = scan([probe])
      if (violations.length > 0) console.log(`PASS  detector catches ${c.label}`)
      else {
        console.log(`FAIL  detector MISSED ${c.label}: ${c.body.trim()}`)
        failures++
      }
    } finally {
      if (existsSync(probe)) unlinkSync(probe)
    }
  }
  // And a negative control: prose must NOT trip it.
  writeFileSync(probe, `// the starter plan was retired; professional too\n`, 'utf8')
  try {
    const { violations } = scan([probe])
    if (violations.length === 0) console.log('PASS  prose does not trip the detector')
    else {
      console.log(`FAIL  prose tripped the detector: ${JSON.stringify(violations)}`)
      failures++
    }
  } finally {
    if (existsSync(probe)) unlinkSync(probe)
  }
  if (failures > 0) {
    console.log(`\n${failures} self-test case(s) failed.`)
    process.exit(1)
  }
  console.log('\nself-test passed')
  process.exit(0)
}

// --- the sweep -------------------------------------------------------------
const files = trackedFiles()
const { violations, inert } = scan(files)

console.log(`scanned ${files.length} tracked file(s), no glob filters`)
console.log(`exempt: ${[...EXEMPT].join(', ')}`)

if (inert.length > 0) {
  console.log(`\n${inert.length} inert hit(s) in applied migrations (a record of what ran, not live logic):`)
  for (const h of inert) console.log(`  ${h.file}:${h.line}  ${h.kind}  '${h.slug}'`)
}

if (violations.length > 0) {
  console.log(`\n${violations.length} VIOLATION(S): a retired plan slug is being compared in live code.`)
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line}  ${v.kind}  '${v.slug}'`)
    console.log(`      ${v.text}`)
  }
  console.log('\nOne plan carries every feature. A comparison against a retired slug can only')
  console.log('grant wrongly or rot silently. Route the decision through subscription status,')
  console.log('licensed capacity, or the pilot window instead.')
  process.exit(1)
}

console.log('\nplan slug sweep verification passed')
