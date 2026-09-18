// Build the genesis migration from the declarative schema mirror.
//
// WHY THIS EXISTS
//
// The seven hottest tables were created in the Supabase dashboard and never
// had a migration. `supabase db reset` therefore fails at the earliest
// migration with `relation "organizations" does not exist`, which means there
// has never been an environment where the real schema and new code meet
// before production. Block 2 was validated against hand-built minimal tables
// for exactly this reason.
//
// supabase/schemas/ is already the authoritative mirror of production
// (AGENTS.md, supabase/schemas/README.md), refreshed with
// `supabase db pull --declarative`. But the CLI does not build a reset from
// it: "Declarative files under supabase/schemas are not part of this
// baseline." So this script turns the mirror into an ordinary migration that
// runs before every other one.
//
//   node scripts/build-genesis-migration.mjs
//
// Regenerate after any `supabase db pull --declarative`, so the genesis file
// keeps tracking production rather than drifting into a third source of
// truth.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SCHEMAS = 'supabase/schemas'
const OUT = 'supabase/migrations/00000000000000_genesis_from_schema_mirror.sql'

/**
 * Topological order for the table files, derived from their own FOREIGN KEY
 * clauses rather than hardcoded, so adding a table to the mirror does not
 * require editing a list here.
 */
function orderTables(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql'))
  const deps = new Map()
  const body = new Map()

  for (const f of files) {
    const name = f.replace(/\.sql$/, '')
    const sql = readFileSync(join(dir, f), 'utf8')
    body.set(name, sql)
    const refs = new Set()
    for (const m of sql.matchAll(/REFERENCES\s+public\.([a-z_]+)/gi)) {
      if (m[1] !== name) refs.add(m[1])
    }
    deps.set(name, refs)
  }

  const ordered = []
  const done = new Set()
  const visiting = new Set()

  function visit(name) {
    if (done.has(name)) return
    if (visiting.has(name)) {
      // A genuine cycle. Emit anyway; the FK will be satisfied once both
      // tables exist, and Postgres tolerates it inside one transaction only
      // when the constraint is added afterwards. Report it rather than hide it.
      console.warn(`  cycle involving ${name} -- verify FK ordering by hand`)
      return
    }
    visiting.add(name)
    for (const d of deps.get(name) ?? []) {
      if (body.has(d)) visit(d)
    }
    visiting.delete(name)
    done.add(name)
    ordered.push(name)
  }

  for (const name of [...body.keys()].sort()) visit(name)
  return ordered.map((n) => ({ name: n, sql: body.get(n) }))
}

function readAll(dir) {
  let out = []
  try {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      out.push({ name: f.replace(/\.sql$/, ''), sql: readFileSync(join(dir, f), 'utf8') })
    }
  } catch {
    /* directory may not exist in the mirror */
  }
  return out
}

const extensions = readAll(`${SCHEMAS}/_cluster/extensions`)
const tables = orderTables(`${SCHEMAS}/public/tables`)
const functions = readAll(`${SCHEMAS}/public/functions`)

const header = `-- GENESIS -- generated file, do not edit by hand.
--
-- Rebuilt by: node scripts/build-genesis-migration.mjs
-- Source:     supabase/schemas/ (the declarative mirror of production)
--
-- The core tables were created in the Supabase dashboard and never had a
-- migration, so \`supabase db reset\` used to fail at the earliest migration
-- with \`relation "organizations" does not exist\`. That left no environment
-- where the real schema and new code could meet before production.
--
-- This file recreates the mirrored schema so a reset works from a clean
-- clone. It is timestamped 00000000000000 so it runs before every existing
-- migration; those migrations are written defensively (IF NOT EXISTS, ADD
-- COLUMN IF NOT EXISTS) and re-apply harmlessly on top.
--
-- Tables are ordered by their own FOREIGN KEY references, computed at build
-- time. Functions follow tables because several are referenced by policies.
--
-- Regenerate after every \`supabase db pull --declarative\` so this file keeps
-- tracking production instead of becoming a third source of truth.
--
-- Contents: ${extensions.length} extension(s), ${tables.length} table(s), ${functions.length} function(s).

`

const parts = [header]

parts.push('-- ============ EXTENSIONS ============\n\n')
parts.push('CREATE SCHEMA IF NOT EXISTS extensions;\n\n')
for (const e of extensions) {
  parts.push(`-- ${e.name}\n${e.sql.replace(/^CREATE EXTENSION /gm, 'CREATE EXTENSION IF NOT EXISTS ')}\n\n`)
}

// Functions come BEFORE tables: RLS policies in the table files call
// is_super_admin(), get_my_organization_id() and friends, and a policy cannot
// reference a function that does not exist yet.
//
// That inverts the usual dependency, because 16 of these functions query the
// very tables defined below. check_function_bodies is on by default, so
// creating them first would fail on the forward reference. Turning it off for
// this transaction is the standard resolution: bodies are validated at call
// time regardless, and every later migration runs with it back on.
parts.push('-- ============ FUNCTIONS ============\n')
parts.push('--\n')
parts.push('-- Created before the tables they query: the table files carry RLS policies\n')
parts.push('-- that call these functions. Body validation is deferred for this file only.\n\n')
parts.push('SET LOCAL check_function_bodies = off;\n\n')
for (const f of functions) {
  parts.push(`-- ---- ${f.name} ----\n${f.sql}\n\n`)
}

// Policies are split out of the table files and applied last.
//
// Policy expressions are ALWAYS validated at creation -- there is no
// check_function_bodies equivalent for them -- and they are mutually
// circular: the policies on `organizations` select from `users`, whose own
// policies select from `organizations`. No table ordering can satisfy that,
// so every CREATE POLICY / ALTER TABLE ... ENABLE ROW LEVEL SECURITY moves to
// a final pass once all tables exist.
// COMMENT ON POLICY moves with its policy: the comment fails if the policy is
// not there yet.
const POLICY_BLOCK =
  /^(?:CREATE\s+POLICY|COMMENT\s+ON\s+POLICY|ALTER\s+TABLE[^;]*?ENABLE\s+ROW\s+LEVEL\s+SECURITY)[\s\S]*?;\s*$/gim

parts.push('-- ============ TABLES ============\n')
parts.push('--\n')
parts.push('-- RLS policies are stripped here and re-applied at the end: they are\n')
parts.push('-- mutually circular (organizations policies read users, users policies read\n')
parts.push('-- organizations) and policy expressions are always validated on creation.\n\n')

const policySql = []
for (const t of tables) {
  const found = t.sql.match(POLICY_BLOCK) ?? []
  if (found.length > 0) {
    policySql.push(`-- ---- ${t.name} ----\n${found.join('\n')}\n`)
  }
  const withoutPolicies = t.sql.replace(POLICY_BLOCK, '').replace(/\n{3,}/g, '\n\n')
  parts.push(`-- ---- ${t.name} ----\n${withoutPolicies.trim()}\n\n`)
}

// Every policy is dropped before being created.
//
// Historical migrations recreate many of these policies, and they are not
// consistent about dropping first -- some carry DROP POLICY IF EXISTS, some
// issue a bare CREATE POLICY that fails with 42710 once genesis has already
// made it. Those migrations are already applied in production and must not be
// edited, so genesis absorbs the difference instead: dropping first makes this
// file re-runnable, and the later CREATEs then land on a clean slot.
parts.push('-- ============ ROW LEVEL SECURITY ============\n')
parts.push('--\n')
parts.push('-- Each policy is dropped before creation so this file is re-runnable and so\n')
parts.push('-- historical migrations that recreate the same policy do not collide.\n\n')
for (const p of policySql) {
  const withDrops = p.replace(
    /^CREATE\s+POLICY\s+("(?:[^"]|"")+"|\S+)\s+ON\s+("?[a-z_]+"?\."?[a-z_]+"?)/gim,
    (match, policyName, tableName) =>
      `DROP POLICY IF EXISTS ${policyName} ON ${tableName};\n${match}`
  )
  parts.push(`${withDrops}\n`)
}

writeFileSync(OUT, parts.join(''), 'utf8')

console.log(`wrote ${OUT}`)
console.log(`  extensions: ${extensions.length}`)
console.log(`  tables:     ${tables.length}`)
console.log(`  functions:  ${functions.length}`)
console.log(`  order:      ${tables.slice(0, 6).map((t) => t.name).join(' -> ')} -> ...`)
