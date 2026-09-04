// R6: no upsert anywhere targets a PARTIAL index.
//
// This is the gate that would have caught the outage. It cross-references every
// onConflict target in the codebase against the schema mirror and fails if any
// of them resolves to a partial index rather than a true constraint, because
// PostgREST cannot express the predicate such an index requires.
import { readdirSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const files = [...walk('app'), ...walk('lib')];
const uses = [];
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)[\s\S]{0,600}?onConflict:\s*['"]([^'"]+)['"]/g)) {
    uses.push({ file: f, table: m[1], cols: m[2] });
  }
}
assert(uses.length > 0, `found onConflict call sites to audit (${uses.length})`);

// Every PARTIAL unique index in the schema mirror, by table.
const partial = new Map();
const tdir = 'supabase/schemas/public/tables';
for (const f of readdirSync(tdir).filter((n) => n.endsWith('.sql'))) {
  const table = f.replace(/\.sql$/, '');
  const sql = read(`${tdir}/${f}`);
  for (const m of sql.matchAll(/CREATE UNIQUE INDEX\s+(\w+)[\s\S]{0,200}?\(([^)]+)\)\s*\n?\s*WHERE/gi)) {
    const cols = m[2].split(',').map((c) => c.trim()).join(',');
    if (!partial.has(table)) partial.set(table, []);
    partial.get(table).push({ index: m[1], cols });
  }
}
console.log(`  (partial unique indexes found: ${[...partial.entries()].map(([t, v]) => `${t}:${v.length}`).join(', ') || 'none'})`);

let bad = 0;
for (const u of uses) {
  const risky = (partial.get(u.table) || []).find((p) => p.cols === u.cols);
  if (risky) {
    console.error(`FAIL: ${u.file} upserts ${u.table} on (${u.cols}), which is the PARTIAL index ${risky.index}`);
    console.error('      PostgREST cannot emit the required predicate -> 42P10 at runtime. Use an RPC.');
    bad++;
  } else {
    console.log(`  ok: ${u.table} on (${u.cols}) is not a partial index`);
  }
}
assert(bad === 0, `no upsert targets a partial index (${bad} offending)`);

// Positive control: the auditor must be able to SEE a partial index, or it
// would pass vacuously on a mirror where none were parsed.
assert(partial.size > 0, 'control: at least one partial unique index was parsed from the mirror');
assert((partial.get('vgp_alerts') || []).some((p) => p.cols === 'schedule_id,alert_type,alert_date'),
  'control: the known partial index on vgp_alerts is detected by the parser');
done('R6_AUDIT_VERIFIED');
