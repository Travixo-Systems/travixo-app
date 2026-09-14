// I3: EXECUTE the real migration against a real Postgres and prove atomicity.
//
// This is the gate that matters. Every text assertion in I2 would still pass if
// the function wrote the three tables in three separate transactions. Atomicity
// is a runtime property, so it is measured at runtime: force the third write to
// fail and confirm the inspection row does NOT survive.
//
// The negative control runs the OLD three-step sequence against the same forced
// failure and confirms the orphan DOES appear -- otherwise a gate that sees no
// orphan proves nothing, because the fixture might simply never fail.
import { readFileSync } from 'node:fs';
import { assert, done } from './_util.mjs';
import { dockerAvailable, startDb, stopDb, psql } from './_pgprobe.mjs';

// _pgprobe's loadMigration() strips GRANT/REVOKE *lines*, which leaves the
// wrapped `TO authenticated, service_role;` continuation of a multi-line GRANT
// dangling -- a syntax error that aborts the whole transaction. The container
// has no anon/authenticated roles, so the statements must still go; they are
// removed whole here instead. I2 asserts them on the text; I7 against the mirror.
function applyMigration(path) {
  const sql = readFileSync(path, 'utf8')
    .replace(/^\s*(GRANT|REVOKE)\b[\s\S]*?;\s*$/gim, '');
  return psql(sql);
}

if (!dockerAvailable()) {
  console.error('FAIL: Docker unavailable - this gate must run a real Postgres');
  process.exit(1);
}

const ORG = '00000000-0000-0000-0000-0000000000aa';
const OTHER_ORG = '00000000-0000-0000-0000-0000000000bb';
const USER = '00000000-0000-0000-0000-0000000000cc';
const ASSET = '00000000-0000-0000-0000-0000000000dd';
const SCHED = '00000000-0000-0000-0000-0000000000ee';
const FOREIGN_ASSET = '00000000-0000-0000-0000-0000000000ff';

// The production shapes, from supabase/schemas/public/tables/. The CHECK
// constraints are reproduced because the function depends on them.
const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
-- auth.uid() is stubbed per-test via a GUC so the org predicate is exercised
-- exactly as it is in production, rather than bypassed.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;

CREATE TABLE organizations (id uuid PRIMARY KEY);
CREATE TABLE users (id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations(id));
CREATE TABLE assets (
  id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations(id),
  name varchar(255) NOT NULL, qr_code varchar(255) NOT NULL UNIQUE,
  qr_url varchar(255) NOT NULL UNIQUE,
  status varchar(50) DEFAULT 'available', updated_at timestamptz DEFAULT now()
);
CREATE TABLE vgp_schedules (
  id uuid PRIMARY KEY, asset_id uuid REFERENCES assets(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id), interval_months integer NOT NULL,
  last_inspection_date date, next_due_date date NOT NULL, status text DEFAULT 'active',
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE vgp_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES assets(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES vgp_schedules(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id),
  inspection_date date NOT NULL, inspector_name text NOT NULL,
  inspector_company text, certification_number text,
  result text NOT NULL CHECK (result = ANY (ARRAY['passed','conditional','failed'])),
  findings text, next_inspection_date date, certificate_url text,
  certificate_file_name text, performed_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  verification_type text NOT NULL DEFAULT 'PERIODIQUE'
    CHECK (verification_type = ANY (ARRAY['PERIODIQUE','INITIALE','REMISE_SERVICE'])),
  observations text NOT NULL DEFAULT 'RAS'
);
CREATE OR REPLACE FUNCTION public.get_my_organization_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT organization_id FROM public.users WHERE id = auth.uid() $$;

INSERT INTO organizations VALUES ('${ORG}'), ('${OTHER_ORG}');
INSERT INTO users VALUES ('${USER}', '${ORG}');
INSERT INTO assets VALUES ('${ASSET}', '${ORG}', 'Bobcat S650', 'QR1', 'https://q/1', 'available');
INSERT INTO assets VALUES ('${FOREIGN_ASSET}', '${OTHER_ORG}', 'Other fleet', 'QR2', 'https://q/2', 'available');
INSERT INTO vgp_schedules VALUES ('${SCHED}', '${ASSET}', '${ORG}', 12, NULL, '2026-01-01', 'active');
`;

const MIG = 'supabase/migrations/20260903100000_record_inspection_rpc.sql';
const AS_USER = `SET LOCAL test.uid = '${USER}';`;
const CERT = 'https://example.invalid/cert.pdf';

const call = (result, extra = '') => psql(`BEGIN; ${AS_USER}
  SELECT public.record_inspection('${ASSET}'::uuid, DATE '2026-09-14', 'Inspector',
    '${result}', '${CERT}', '${SCHED}'::uuid); ${extra} COMMIT;`);
const count = (t, where = '') => psql(`SELECT count(*) FROM ${t} ${where};`).trim();

startDb();
try {
  psql(SCHEMA);

  const applied = applyMigration(MIG);
  assert(!/ERROR/i.test(applied), `migration applies without error (got: ${applied.trim().slice(0, 160)})`);
  const again = applyMigration(MIG);
  assert(!/ERROR/i.test(again), `migration is re-runnable (got: ${again.trim().slice(0, 160)})`);

  // --- Happy path: passed advances the schedule 12 months, asset untouched.
  assert(!/ERROR/i.test(call('passed')), 'a passed inspection records');
  assert(count('vgp_inspections') === '1', 'exactly one inspection row');
  assert(psql(`SELECT next_due_date FROM vgp_schedules WHERE id='${SCHED}';`).trim() === '2027-09-14',
    'passed advances next_due_date by interval_months (12)');
  assert(psql(`SELECT status FROM vgp_schedules WHERE id='${SCHED}';`).trim() === 'completed',
    'passed sets schedule status completed');
  assert(psql(`SELECT status FROM assets WHERE id='${ASSET}';`).trim() === 'available',
    'passed leaves the asset available');

  // --- conditional: 6 months, and deliberately does NOT block the asset.
  psql(`DELETE FROM vgp_inspections;`);
  assert(!/ERROR/i.test(call('conditional')), 'a conditional inspection records');
  assert(psql(`SELECT next_due_date FROM vgp_schedules WHERE id='${SCHED}';`).trim() === '2027-03-14',
    'conditional advances 6 months');
  assert(psql(`SELECT status FROM assets WHERE id='${ASSET}';`).trim() === 'available',
    'conditional leaves the asset available (verified against a real 2026-09-02 inspection)');

  // --- failed: 30 days, schedule failed, asset out_of_service. The safety path.
  psql(`DELETE FROM vgp_inspections;`);
  assert(!/ERROR/i.test(call('failed')), 'a failed inspection records');
  assert(psql(`SELECT next_due_date FROM vgp_schedules WHERE id='${SCHED}';`).trim() === '2026-10-14',
    'failed advances 30 days');
  assert(psql(`SELECT status FROM vgp_schedules WHERE id='${SCHED}';`).trim() === 'failed',
    'failed sets schedule status failed');
  assert(psql(`SELECT status FROM assets WHERE id='${ASSET}';`).trim() === 'out_of_service',
    'failed takes the machine out of service - the write whose silent failure is the finding');

  // --- Validation refusals.
  psql(`DELETE FROM vgp_inspections; UPDATE assets SET status='available' WHERE id='${ASSET}';`);
  assert(/certificate_required/i.test(psql(`BEGIN; ${AS_USER}
    SELECT public.record_inspection('${ASSET}'::uuid, DATE '2026-09-14', 'I', 'passed', '', '${SCHED}'::uuid); COMMIT;`)),
    'a missing certificate is refused (DREETS conformance)');
  assert(/invalid_result/i.test(call('bogus')), 'an invalid result is refused');
  assert(/asset_not_found/i.test(psql(`BEGIN; ${AS_USER}
    SELECT public.record_inspection('${FOREIGN_ASSET}'::uuid, DATE '2026-09-14', 'I', 'passed', '${CERT}'); COMMIT;`)),
    'cross-tenant asset is refused - no write into another org fleet');
  assert(/no_organization/i.test(psql(`BEGIN; SET LOCAL test.uid = '';
    SELECT public.record_inspection('${ASSET}'::uuid, DATE '2026-09-14', 'I', 'passed', '${CERT}'); COMMIT;`)),
    'an unauthenticated caller is refused (get_my_organization_id is NULL)');
  assert(count('vgp_inspections') === '0', 'no refused call wrote an inspection row');

  // --- ATOMICITY. Force the third write to fail with a CHECK the asset UPDATE
  //     must violate, then confirm nothing survived.
  //
  //     Reset the SCHEDULE too, not just inspections and the asset. The failed
  //     block above legitimately left it status='failed', next_due 2026-10-14;
  //     without this reset the post-condition below reads that stale state and
  //     reports a surviving write where the forced call in fact wrote nothing.
  psql(`UPDATE vgp_schedules SET status='active', next_due_date=DATE '2026-01-01',
        last_inspection_date=NULL WHERE id='${SCHED}';`);
  const schedBefore = psql(`SELECT status||'|'||next_due_date FROM vgp_schedules WHERE id='${SCHED}';`).trim();
  assert(schedBefore === 'active|2026-01-01', `schedule reset before the forced failure (got ${schedBefore})`);

  psql(`ALTER TABLE assets ADD CONSTRAINT no_oos CHECK (status <> 'out_of_service');`);
  const forced = call('failed');
  assert(/ERROR/i.test(forced), 'the forced asset-update failure does raise');
  assert(count('vgp_inspections') === '0',
    'ATOMIC: the inspection row did NOT survive a failed asset update');
  assert(psql(`SELECT status||'|'||next_due_date FROM vgp_schedules WHERE id='${SCHED}';`).trim() === schedBefore,
    'ATOMIC: the schedule advance did NOT survive either (unchanged from the pre-call reset)');

  // --- Negative control. The OLD three-step sequence, same forced failure.
  //     If this does not leave an orphan, the fixture cannot detect the defect
  //     and every assertion above is worthless.
  psql(`BEGIN; ${AS_USER}
    INSERT INTO vgp_inspections (asset_id, schedule_id, organization_id, inspection_date,
      inspector_name, result, certificate_url, next_inspection_date)
    VALUES ('${ASSET}', '${SCHED}', '${ORG}', DATE '2026-09-14', 'Inspector', 'failed',
      '${CERT}', DATE '2026-10-14'); COMMIT;`);
  const orphanAttempt = psql(`BEGIN;
    UPDATE assets SET status='out_of_service' WHERE id='${ASSET}'; COMMIT;`);
  assert(/ERROR/i.test(orphanAttempt), 'control: the same asset update still fails');
  assert(count('vgp_inspections') === '1',
    'control: the OLD sequence DOES leave a failed inspection while the asset stays bookable - the defect is detectable');

  done('I3_ATOMIC_VERIFIED');
} finally {
  stopDb();
}
