#!/usr/bin/env node
/**
 * verify-config-toml-sane.mjs
 *
 * Fails if supabase/config.toml declares the same TOML table twice.
 *
 * WHY THIS EXISTS
 *
 * `npx supabase db pull --declarative` APPENDS `[db.migrations]` to
 * config.toml instead of rewriting it. Reproduced deterministically on CLI
 * 2.116.0, 2026-09-15:
 *
 *   BEFORE: 4 lines, [db.migrations] x1
 *   ...run db pull --declarative, exit 0, "Declarative schema pulled."
 *   AFTER:  9 lines, [db.migrations] x2
 *
 * TOML forbids redefining a table, so the next CLI invocation dies with:
 *
 *   {"_tag":"Error","error":{"code":"LegacyDbConfigLoadError","message":
 *    "failed to load config: Invalid TOML document: trying to redefine an
 *     already defined table or value\n\n6:  [db.migrations]"}}
 *
 * That error is the whole point of this gate. It arrives on STDOUT as JSON,
 * with a NON-ZERO exit code -- but a pipeline that greps the output for
 * migration rows finds none and happily reports "0 pending, 0 applied". During
 * the 2026-09-15 ledger reconciliation that is exactly what happened: several
 * readings of `supabase migration list` were parsing an error payload and
 * reporting zero, while the real ledger held 47 applied. A reconciliation that
 * silently reads zero is worse than one that crashes.
 *
 * So: after ANY `db pull`, run this. It turns a silent zero into a loud stop.
 *
 * WHAT IT CHECKS
 *
 * Every `[table]` and `[[array-of-table]]` header in supabase/config.toml,
 * for duplicates. Not just [db.migrations] -- the append bug is specific
 * today, but any duplicated header breaks the same way, and a rule that only
 * knows one name would miss the next one.
 *
 * Run with --self-test to prove the detector can fail.
 *
 * It detects and refuses; it does not repair. `git checkout -- supabase/config.toml`
 * restores the tracked file exactly, which is the whole fix.
 */

import { readFileSync } from 'fs'

const CONFIG = 'supabase/config.toml'

/**
 * Parse TOML table headers with their line numbers.
 *
 * Deliberately naive: it only looks at lines whose first non-space character
 * is `[`, which is all a header can be. Keys, values and comments cannot
 * produce a false header, and a `[` inside a multi-line array is indented
 * under its key rather than starting a line at column 0. That is enough to
 * catch a duplicated block without embedding a TOML parser.
 */
function headers(text) {
  const out = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(\[\[?[^\]]+\]\]?)\s*(?:#.*)?$/)
    if (m) out.push({ header: m[1].trim(), line: i + 1 })
  }
  return out
}

function findDuplicates(text) {
  const seen = new Map()
  const dupes = []
  for (const h of headers(text)) {
    if (seen.has(h.header)) {
      dupes.push({ header: h.header, first: seen.get(h.header), repeat: h.line })
    } else {
      seen.set(h.header, h.line)
    }
  }
  return dupes
}

// --- self-test ---------------------------------------------------------
if (process.argv.includes('--self-test')) {
  const broken = [
    '[db.migrations]',
    'schema_paths = [',
    '  "schemas",',
    ']',
    '',
    '[db.migrations]',
    'schema_paths = [',
    '  "schemas",',
    ']',
  ].join('\n')

  const dupes = findDuplicates(broken)
  if (dupes.length !== 1 || dupes[0].header !== '[db.migrations]') {
    console.error('SELF-TEST FAILED: detector missed a duplicated [db.migrations]')
    console.error(JSON.stringify(dupes, null, 2))
    process.exit(1)
  }

  const clean = '[db.migrations]\nschema_paths = [\n  "schemas",\n]\n'
  if (findDuplicates(clean).length !== 0) {
    console.error('SELF-TEST FAILED: detector reported a duplicate in a clean file')
    process.exit(1)
  }

  console.log('SELF-TEST PASSED: catches the duplicated [db.migrations], passes a clean file')
  process.exit(0)
}

// --- main --------------------------------------------------------------
let text
try {
  text = readFileSync(CONFIG, 'utf8')
} catch (err) {
  console.error(`FAIL: cannot read ${CONFIG}: ${err.message}`)
  process.exit(1)
}

const dupes = findDuplicates(text)

if (dupes.length === 0) {
  console.log(`CONFIG_TOML_SANE_OK (${headers(text).length} table header(s), no duplicates)`)
  process.exit(0)
}

// There is deliberately no --fix. An earlier draft had one; it computed block
// boundaries wrongly and declared two byte-identical blocks "NOT identical",
// repairing nothing while reporting a specific-sounding reason. A repair path
// that is confidently wrong about config is worse than no repair path, and
// `git checkout -- supabase/config.toml` restores the tracked file exactly.

console.error(`\nFAIL: ${CONFIG} declares the same TOML table more than once.\n`)
for (const d of dupes) {
  console.error(`  ${d.header}  first declared line ${d.first}, repeated line ${d.repeat}`)
}
console.error(`
TOML forbids redefining a table, so EVERY subsequent Supabase CLI call fails
with LegacyDbConfigLoadError -- including 'migration list', whose output a
pipeline may then parse as "0 applied, 0 pending". A ledger that silently
reads zero is how eleven applied migrations came to look unapplied.

Cause: 'supabase db pull --declarative' appends [db.migrations] rather than
rewriting it (reproduced on CLI 2.116.0). Run this check after every pull.

Fix:  git checkout -- ${CONFIG}
`)
process.exit(1)
