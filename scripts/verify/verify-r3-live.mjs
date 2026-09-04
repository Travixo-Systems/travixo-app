// R3: execute the REAL migration against a real Postgres and prove the claim
// semantics the cron depends on. This is the gate whose absence let 42P10 reach
// production: every prior gate asserted on source text.
import { assert, done } from './_util.mjs';
import { dockerAvailable, startDb, stopDb, psql, SCHEMA, loadMigration } from './_pgprobe.mjs';

if (!dockerAvailable()) {
  console.error('FAIL: Docker unavailable - this gate must run a real Postgres');
  process.exit(1);
}

const MIG = 'supabase/migrations/20260904100000_claim_vgp_alerts_rpc.sql';

function claim(rows) {
  const json = JSON.stringify(rows).replace(/'/g, "''");
  return psql(`SELECT out_schedule_id FROM claim_vgp_alerts('${json}'::jsonb);`);
}
const idsIn = (out) => (out.match(/[0-9a-f]{8}-[0-9a-f]{4}-/g) || []).length;

const base = {
  alert_type: 'overdue', urgency_level: 'overdue',
  alert_date: '2026-09-04', due_date: '2026-08-01',
  email_sent_to: ['a@example.invalid', 'b@example.invalid'],
};
const S1 = '11111111-1111-1111-1111-111111111111';
const S2 = '22222222-2222-2222-2222-222222222222';
const S3 = '33333333-3333-3333-3333-333333333333';

startDb();
try {
  psql(SCHEMA);

  // The migration must apply cleanly as written.
  const applied = loadMigration(MIG);
  assert(!/ERROR/i.test(applied), `migration applies without error (got: ${applied.trim().slice(0, 140)})`);

  // It must be re-runnable - CREATE OR REPLACE cannot change a return type.
  const again = loadMigration(MIG);
  assert(!/ERROR/i.test(again), `migration is re-runnable (got: ${again.trim().slice(0, 140)})`);

  // 1. First claim of a two-row batch.
  assert(idsIn(claim([{ ...base, schedule_id: S1, asset_id: null, organization_id: null },
                      { ...base, schedule_id: S2 }])) === 2, 'first claim returns both rows');

  // 2. Identical re-claim returns nothing - the dedup that stops duplicate mail.
  assert(idsIn(claim([{ ...base, schedule_id: S1 }, { ...base, schedule_id: S2 }])) === 0,
    'identical re-claim returns zero rows');

  // 3. Partial claim: only the unheld schedule comes back.
  const partial = claim([{ ...base, schedule_id: S1 }, { ...base, schedule_id: S3 }]);
  assert(idsIn(partial) === 1, 'partial claim returns exactly one row');
  assert(partial.includes(S3), 'the returned row is the NEW schedule, not the held one');

  // 4. Data fidelity: the array column and flags survive the JSONB round trip.
  const row = psql(`SELECT sent, resolved, array_length(email_sent_to,1), alert_type, urgency_level
                    FROM vgp_alerts WHERE schedule_id='${S1}';`);
  assert(/^t\|f\|2\|overdue\|overdue/m.test(row.trim()),
    `row written correctly: sent=t resolved=f 2 recipients (got: ${row.trim()})`);

  // 5. Release then re-claim - the failed-send retry path.
  psql(`DELETE FROM vgp_alerts WHERE schedule_id='${S2}';`);
  assert(idsIn(claim([{ ...base, schedule_id: S2 }])) === 1,
    'a released claim can be re-claimed (failed-send retry works)');

  // 6. A different date is a different claim - tomorrow's run is not blocked.
  assert(idsIn(claim([{ ...base, schedule_id: S1, alert_date: '2026-09-05' }])) === 1,
    'the next day is a distinct claim');

  // 7. Negative control: the gate can detect a BROKEN function. Redefine it
  //    without the predicate and confirm the failure surfaces.
  psql(`CREATE OR REPLACE FUNCTION broken_claim(p JSONB) RETURNS TABLE(out_id UUID)
        LANGUAGE plpgsql AS $$ BEGIN RETURN QUERY
          INSERT INTO vgp_alerts (schedule_id, alert_type, alert_date, due_date, sent)
          SELECT (r->>'schedule_id')::UUID, r->>'alert_type', (r->>'alert_date')::DATE,
                 (r->>'due_date')::DATE, TRUE
          FROM jsonb_array_elements(p) AS r
          ON CONFLICT (schedule_id, alert_type, alert_date) DO NOTHING
          RETURNING vgp_alerts.id; END; $$;`);
  const broken = psql(`SELECT * FROM broken_claim('[{"schedule_id":"${S3}","alert_type":"overdue","alert_date":"2026-09-09","due_date":"2026-08-01"}]'::jsonb);`);
  assert(/42P10|no unique or exclusion constraint/i.test(broken),
    'control: a predicate-less function still fails, so this gate can detect the defect');

  done('R3_LIVE_VERIFIED');
} finally {
  stopDb();
}
