#!/usr/bin/env node
/**
 * verify-phantom-columns.mjs
 *
 * Fails if a PostgREST filter references a column the target table does not
 * have.
 *
 * WHY THIS EXISTS
 *
 * app/api/vgp/report/route.ts filtered overdue schedules with
 * `.eq("archived", false)`. vgp_schedules carries archived_at and archived_by,
 * and no boolean twin. PostgREST answers that with 42703, the route discarded
 * the error, `data` arrived undefined, and the overdue list degraded to [].
 *
 * Every DREETS compliance report, for every organization, stated zero overdue
 * equipment. EuroRent's true count that day was 326. The bug shipped in the
 * initial commit and survived until someone compared the PDF against the
 * database -- nothing crashed, no error was logged, and the output was a clean
 * bill of health.
 *
 * That is the class this gate closes: a filter that is silently always-empty.
 *
 * WHAT IT CHECKS
 *
 * Column names in filter methods, resolved against supabase/schemas/, which
 * docs/working-agreements.md designates authoritative. types/database.ts is
 * generated and is currently stale -- it omits subscriptions.licensed_capacity,
 * organizations.demo_alert_sent/welcome_email_sent and five tables -- so it is
 * deliberately NOT consulted.
 *
 * WHAT IT DOES NOT CHECK
 *
 * Whether the caller checks the returned error. 61 call sites currently
 * discard it, which is what made the report bug invisible rather than loud.
 * That is a refactor, not a gate, and is tracked separately.
 *
 * Run with --self-test to prove the detector can fail.
 */

import { execFileSync } from 'child_process'
import { readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'

const TABLES_DIR = 'supabase/schemas/public/tables'

/**
 * Filter methods that take a column name as their first argument.
 *
 * Deliberately excludes .select(), .order() and .or(): those carry embedded
 * resources, aliases, computed expressions and nested filter grammar, and
 * parsing them with a regex produces false positives faster than it finds
 * bugs. Filters are where an absent column silently empties a result set.
 */
const FILTER_METHODS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'overlaps',
]

const SKIP_EXT = /\.(png|jpg|jpeg|gif|webp|ico|svg|pdf|woff2?|ttf|eot|mp4|zip|xlsx?|lock|sql|md)$/i

/** Read the declarative mirror: table name -> Set of column names. */
function loadSchema() {
  const tables = new Map()
  for (const file of readdirSync(TABLES_DIR)) {
    if (!file.endsWith('.sql')) continue
    const sql = readFileSync(join(TABLES_DIR, file), 'utf8')
    const table = file.replace(/\.sql$/, '')
    const cols = new Set()

    // Column lines inside CREATE TABLE: `"name" type ...`. CONSTRAINT lines
    // and anything not starting with a quoted identifier are skipped.
    const body = sql.slice(sql.indexOf('('), sql.indexOf('\n);'))
    for (const line of body.split('\n')) {
      const m = line.match(/^\s+"([a-z0-9_]+)"\s+\S/i)
      if (m && !/^\s*CONSTRAINT/i.test(line)) cols.add(m[1])
    }
    if (cols.size > 0) tables.set(table, cols)
  }
  return tables
}

/**
 * Walk backwards from a filter call to the .from("x") that opened its chain.
 *
 * Chains are built across lines and sometimes across statements
 * (`let q = supabase.from('assets')...; q = q.eq(...)`), so this scans upward
 * for the nearest .from() and stops at a blank-line boundary or another await,
 * which is where a new chain almost always begins.
 */
function resolveTable(lines, idx) {
  for (let i = idx; i >= 0 && i > idx - 40; i--) {
    const m = lines[i].match(/\.from\(\s*['"`]([a-z0-9_]+)['"`]\s*\)/i)
    if (m) return m[1]
    if (/\.rpc\(/.test(lines[i])) return null   // RPC args are not columns
  }
  return null
}

function scan(files, schema) {
  const violations = []
  const methodAlt = FILTER_METHODS.join('|')

  /**
   * A real filter call is `.eq(` followed by a QUOTED first argument.
   *
   * The false positive this guards against is different in kind, and the
   * quote is what separates them. PostgREST's .or() grammar embeds the same
   * method names inside a single string:
   *
   *   .or('is_demo_data.eq.false,is_demo_data.is.null')
   *
   * There `.eq.` and `.is.` are followed by a bare literal, never by a quote
   * opening an argument, so requiring `(` + quote excludes them without
   * needing a guard on what precedes the method -- a guard that also rejected
   * a `.eq(` at the start of an indented line, which is the common formatting
   * and was silently disabling the whole detector.
   */
  const re = new RegExp(
    `\\.(${methodAlt})\\(\\s*['"\`]([A-Za-z0-9_.]+)['"\`]`,
    'g'
  )

  /**
   * Strip .or(...) arguments so their inner grammar cannot be re-parsed, and
   * drop comments so prose about a filter is not read as one.
   *
   * The comment case is not hypothetical: app/api/stripe/checkout/route.ts
   * documents why it uses .or() rather than .eq('is_demo_data', false), and
   * that sentence looks exactly like the bug this gate hunts.
   */
  /**
   * The trailing \r is stripped FIRST. The repo checks out CRLF on Windows,
   * and `.*$` cannot match across a carriage return without the m flag, so
   * the comment rule silently matched nothing and every commented filter was
   * still being reported.
   */
  const sanitize = (line) =>
    line
      .replace(/\r$/, '')
      .replace(/\.or\(\s*(['"`])[\s\S]*?\1/g, '.or($1$1')
      .replace(/^\s*(\/\/|\*|\/\*).*$/, '')

  for (const file of files) {
    if (SKIP_EXT.test(file)) continue
    if (!/\.(ts|tsx|mjs|js)$/.test(file)) continue
    if (!existsSync(file)) continue

    const src = readFileSync(file, 'utf8')
    if (!src.includes('.from(')) continue
    const lines = src.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = sanitize(lines[i])
      re.lastIndex = 0
      let m
      while ((m = re.exec(line)) !== null) {
        const [, method, column] = m

        // Embedded-resource filter: "assets.is_demo_data" targets the embedded
        // table, not the parent. Resolve the prefix to its own table.
        let targetTable, targetColumn
        if (column.includes('.')) {
          const parts = column.split('.')
          targetTable = parts[0].replace(/!inner$/, '')
          targetColumn = parts[parts.length - 1]
          if (!schema.has(targetTable)) continue   // not a table we can judge
        } else {
          targetTable = resolveTable(lines, i)
          targetColumn = column
          if (!targetTable || !schema.has(targetTable)) continue
        }

        if (!schema.get(targetTable).has(targetColumn)) {
          // Suggest the closest real column, the way Postgres does.
          const near = [...schema.get(targetTable)]
            .filter((c) => c.startsWith(targetColumn) || targetColumn.startsWith(c))
            .slice(0, 2)
          violations.push({
            file, line: i + 1, method, table: targetTable,
            column: targetColumn, near,
          })
        }
      }
    }
  }
  return violations
}

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => f.startsWith('app/') || f.startsWith('lib/') ||
                   f.startsWith('scripts/') || f.startsWith('components/'))
}

// --- self-test ---------------------------------------------------------
if (process.argv.includes('--self-test')) {
  const schema = loadSchema()
  const tmp = 'scripts/.phantom-self-test.ts'
  writeFileSync(tmp, `
    const x = await supabase
      .from("vgp_schedules")
      .select("id")
      .eq("archived", false);
  `)
  const found = scan([tmp], schema)
  unlinkSync(tmp)

  if (found.length !== 1 || found[0].column !== 'archived') {
    console.error('SELF-TEST FAILED: detector did not catch the known bug')
    console.error(JSON.stringify(found, null, 2))
    process.exit(1)
  }
  console.log('SELF-TEST PASSED: detector catches .eq("archived", false) on vgp_schedules')
  process.exit(0)
}

// --- main --------------------------------------------------------------
const schema = loadSchema()
if (schema.size === 0) {
  console.error(`FAIL: no tables parsed from ${TABLES_DIR}. Is the mirror present?`)
  process.exit(1)
}

const violations = scan(trackedFiles(), schema)

if (violations.length > 0) {
  console.error(`\nFAIL: ${violations.length} filter(s) reference a column that does not exist.\n`)
  for (const v of violations) {
    const hint = v.near.length ? `  (did you mean ${v.near.join(' or ')}?)` : ''
    console.error(`  ${v.file}:${v.line}`)
    console.error(`    .${v.method}("${v.column}") on ${v.table} -- no such column${hint}`)
  }
  console.error(`\nPostgREST answers these with 42703. A caller that does not check`)
  console.error(`the error sees an empty result and reports it as a real zero.\n`)
  process.exit(1)
}

console.log(`PHANTOM_COLUMN_SWEEP_OK (${schema.size} tables, ${trackedFiles().length} files)`)
