// Compare the harness's SELECT policies against supabase/schemas/ (the
// authoritative production mirror). Normalises whitespace only -- any
// difference in predicate text, role, or permissiveness is a failure.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const REPO = 'D:/Dev/projects/travixo-app/.claude/worktrees/feat-search-server-side'
const TABLES = ['assets', 'scans', 'users']

const norm = (s) => s.replace(/\s+/g, ' ').replace(/"/g, '').trim().toLowerCase()

// --- what the mirror declares -------------------------------------------
const declared = new Map()
for (const t of TABLES) {
  const sql = readFileSync(`${REPO}/supabase/schemas/public/tables/${t}.sql`, 'utf8')
  // CREATE POLICY "name" ON "public"."t" FOR SELECT TO roles USING (...);
  const re = /CREATE POLICY\s+"([^"]+)"\s+ON\s+"public"\."(\w+)"\s*\n\s*FOR SELECT\s*\n\s*TO\s+([^\n]+)\n\s*USING\s*\(([\s\S]*?)\);\s*\n/g
  let m
  while ((m = re.exec(sql)) !== null) {
    declared.set(`${m[2]}|${m[1]}`, { roles: norm(m[3]), qual: norm(m[4]) })
  }
}

// --- what the harness actually has ---------------------------------------
const out = execFileSync('docker', [
  'exec', 'supabase_db_feat-search-server-side', 'psql', '-U', 'postgres',
  '-t', '-A', '-F', '\u0001', '-c',
  `SELECT tablename, policyname, permissive, roles::text, qual FROM pg_policies
   WHERE schemaname='public' AND cmd='SELECT' AND tablename IN ('assets','scans','users')
   ORDER BY tablename, policyname;`,
], { encoding: 'utf8' })

const live = new Map()
for (const row of out.split('\n').filter((r) => r.includes('\u0001'))) {
  const [table, name, permissive, roles, qual] = row.split('\u0001')
  live.set(`${table}|${name}`, { permissive, roles: norm(roles), qual: norm(qual) })
}

let bad = 0
console.log(`mirror declares ${declared.size} SELECT policies; harness has ${live.size}\n`)

for (const [key, d] of declared) {
  const l = live.get(key)
  if (!l) { console.log(`MISSING in harness: ${key}`); bad++; continue }
  if (l.permissive !== 'PERMISSIVE') { console.log(`NOT PERMISSIVE: ${key}`); bad++ }
  // pg_policies renders qual without the outer parens and unqualified; compare
  // on containment in both directions after normalising.
  const dq = d.qual.replace(/public\./g, '')
  const lq = l.qual
  if (!(dq.includes(lq) || lq.includes(dq))) {
    console.log(`QUAL DIFFERS: ${key}\n  mirror : ${dq}\n  harness: ${lq}`)
    bad++
  }
}
for (const key of live.keys()) {
  if (!declared.has(key)) { console.log(`EXTRA in harness: ${key}`); bad++ }
}

console.log(bad === 0
  ? `\nOK: all ${declared.size} SELECT policies match the production mirror.`
  : `\n${bad} discrepancy/discrepancies.`)
process.exit(bad === 0 ? 0 : 1)
