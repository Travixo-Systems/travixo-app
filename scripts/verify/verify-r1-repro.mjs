// R1: reproduce the production defect on a REAL database, then prove the fix
// form works. Without this the diagnosis is a story about Postgres rather than
// a measurement of it.
import { assert, done } from './_util.mjs';
import { dockerAvailable, startDb, stopDb, psql, SCHEMA } from './_pgprobe.mjs';

if (!dockerAvailable()) {
  console.error('FAIL: Docker unavailable - this gate must run a real Postgres');
  process.exit(1);
}

startDb();
try {
  psql(SCHEMA);

  const row = `('11111111-1111-1111-1111-111111111111','overdue','2026-09-04','2026-08-01', true)`;
  const cols = `(schedule_id, alert_type, alert_date, due_date, sent)`;

  // A: what PostgREST emits for .upsert({ onConflict: 'a,b,c' }).
  const a = psql(`INSERT INTO vgp_alerts ${cols} VALUES ${row}
    ON CONFLICT (schedule_id, alert_type, alert_date) DO NOTHING RETURNING id;`);
  assert(/42P10|no unique or exclusion constraint/i.test(a),
    `bare conflict target raises 42P10 (got: ${a.trim().slice(0, 90)})`);

  // B: the same statement with the index predicate repeated.
  const b = psql(`INSERT INTO vgp_alerts ${cols} VALUES ${row}
    ON CONFLICT (schedule_id, alert_type, alert_date) WHERE sent = true
    DO NOTHING RETURNING id;`);
  assert(!/ERROR/i.test(b) && /[0-9a-f]{8}-/.test(b),
    `predicate in the conflict target succeeds (got: ${b.trim().slice(0, 90)})`);

  // Counterfactual: a NON-partial index would break claim release.
  psql(`CREATE TABLE alt (schedule_id uuid, alert_type text, alert_date date, sent boolean);
        CREATE UNIQUE INDEX alt_u ON alt (schedule_id, alert_type, alert_date);
        INSERT INTO alt VALUES ('33333333-3333-3333-3333-333333333333','overdue','2026-09-04', false);`);
  const c = psql(`INSERT INTO alt VALUES ('33333333-3333-3333-3333-333333333333','overdue','2026-09-04', true)
    ON CONFLICT (schedule_id, alert_type, alert_date) DO NOTHING RETURNING schedule_id;`);
  assert(!/[0-9a-f]{8}-/.test(c),
    'counterfactual: under a NON-partial index a released claim blocks re-claiming forever');

  done('R1_REPRO_CONFIRMED');
} finally {
  stopDb();
}
