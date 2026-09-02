// G2: the demo-exclusion predicate must drop demo assets WITHOUT dropping
// legacy real assets whose is_demo_data is NULL (the column is nullable:
// `"is_demo_data" boolean DEFAULT false` with no NOT NULL).
//
// This does not trust the source text. It imports the exported predicate and
// runs it over a fixture table that includes a positive control (a demo row
// that MUST be dropped) and negative controls (null/undefined/false rows that
// MUST be kept). If the predicate were inverted or a no-op, the controls fail.
import { assert, done } from './_util.mjs';
import { loadTs } from './_load-ts.mjs';

const mod = await loadTs('lib/vgp/demo-exclusion.ts').catch(() => null);
if (!mod || typeof mod.isDemoSchedule !== 'function') {
  console.error('FAIL: lib/vgp/demo-exclusion.ts must export isDemoSchedule()');
  process.exit(1);
}
const { isDemoSchedule } = mod;

const cases = [
  { label: 'demo asset (positive control) is excluded',      row: { assets: { is_demo_data: true } },      expect: true },
  { label: 'explicit false is kept',                          row: { assets: { is_demo_data: false } },     expect: false },
  { label: 'NULL is_demo_data (legacy real asset) is kept',   row: { assets: { is_demo_data: null } },      expect: false },
  { label: 'undefined is_demo_data (not selected) is kept',   row: { assets: {} },                          expect: false },
  { label: 'missing assets embed is kept (fail-open, real)',  row: {},                                      expect: false },
  { label: 'null assets embed is kept',                       row: { assets: null },                        expect: false },
  { label: 'string "true" is not treated as demo',            row: { assets: { is_demo_data: 'true' } },    expect: false },
];

for (const c of cases) {
  const got = isDemoSchedule(c.row);
  assert(got === c.expect, `${c.label} (got ${got}, want ${c.expect})`);
}

// Positive control on the aggregate filter: a mixed batch must lose exactly
// the demo row and keep every other row, preserving order.
const batch = [
  { id: 'a', assets: { is_demo_data: false } },
  { id: 'b', assets: { is_demo_data: true } },
  { id: 'c', assets: { is_demo_data: null } },
  { id: 'd', assets: {} },
];
const kept = batch.filter((s) => !isDemoSchedule(s)).map((s) => s.id);
assert(JSON.stringify(kept) === JSON.stringify(['a', 'c', 'd']),
  `mixed batch keeps a,c,d and drops b (got ${JSON.stringify(kept)})`);

done('FIX1_BEHAVIOUR_VERIFIED');
