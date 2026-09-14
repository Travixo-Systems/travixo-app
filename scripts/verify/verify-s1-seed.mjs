// S1: EXECUTE the seed against a real Postgres and prove the invariants.
//
// The one that matters is negative: seeding the catalogue must not associate
// any of the 625 existing schedules. A negative assertion proves nothing
// unless the fixture could have failed it, so this creates pre-existing
// schedules first and re-checks them after the seed -- and runs a positive
// control confirming the same query DOES report an association when one is
// deliberately made.
import { readFileSync } from 'node:fs';
import { assert, done } from './_util.mjs';
import { dockerAvailable, startDb, stopDb, psql } from './_pgprobe.mjs';

if (!dockerAvailable()) {
  console.error('FAIL: Docker unavailable - this gate must run a real Postgres');
  process.exit(1);
}

const CATALOGUE = 'supabase/migrations/20260914120000_vgp_regulatory_profiles.sql';
const SEED = 'supabase/migrations/20260914140000_seed_vgp_regulatory_profiles.sql';

// GRANT/REVOKE statements are removed whole: the container has the roles, but
// stripping by LINE would leave a wrapped `TO authenticated, service_role;`
// continuation dangling and abort the transaction.
const upOf = (p) =>
  readFileSync(p, 'utf8').split('-- DOWN')[0];

const ROLES = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN; CREATE EXTENSION IF NOT EXISTS pgcrypto;`;

// The pre-migration shape, so the catalogue migration has something to rename.
const SCHEMA = `
CREATE TABLE organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE assets(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE vgp_equipment_types(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, category text NOT NULL,
  default_interval_months integer NOT NULL,
  regulatory_reference text, description text,
  created_at timestamptz DEFAULT now());
ALTER TABLE vgp_equipment_types ENABLE ROW LEVEL SECURITY;
CREATE TABLE vgp_schedules(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES assets(id),
  organization_id uuid REFERENCES organizations(id),
  interval_months integer NOT NULL, next_due_date date NOT NULL,
  archived_by uuid REFERENCES users(id));`;

// Stand in for the 625 live schedules, with the same interval mix.
const PREEXISTING = `
INSERT INTO organizations DEFAULT VALUES;
INSERT INTO assets DEFAULT VALUES;
INSERT INTO vgp_schedules (asset_id, organization_id, interval_months, next_due_date)
SELECT a.id, o.id, v.months, DATE '2027-01-01'
FROM assets a, organizations o,
     (VALUES (12),(12),(12),(6),(6),(24)) AS v(months);`;

const one = (sql) => psql(sql).trim();

startDb();
try {
  psql(ROLES);
  assert(!/ERROR/i.test(psql(SCHEMA)), 'fixture schema builds');
  assert(!/ERROR/i.test(psql(PREEXISTING)), 'pre-existing schedules created');

  const before = one('SELECT count(*) FROM vgp_schedules;');
  assert(before === '6', `6 schedules exist before the seed (got ${before})`);
  const intervalsBefore =
    one("SELECT string_agg(interval_months::text, ',' ORDER BY interval_months) FROM vgp_schedules;");

  assert(!/ERROR/i.test(psql(upOf(CATALOGUE))), 'catalogue migration applies');

  const seedOut = psql(upOf(SEED));
  assert(!/ERROR/i.test(seedOut), `seed applies without error (got: ${seedOut.trim().slice(0, 160)})`);

  // --- Row count and shape.
  assert(one('SELECT count(*) FROM vgp_regulatory_profiles;') === '24', 'exactly 24 profiles');

  const byInterval = one(`SELECT string_agg(k, ' ' ORDER BY k) FROM (
    SELECT coalesce(default_interval_months::text,'NULL')||'x'||count(*)::text AS k
    FROM vgp_regulatory_profiles GROUP BY default_interval_months) t;`);
  assert(byInterval === '12x7 3x2 6x14 NULLx1',
    `interval distribution is 3:2 6:14 12:7 NULL:1 (got ${byInterval})`);

  const byStatus = one(`SELECT string_agg(k, ' ' ORDER BY k) FROM (
    SELECT classification_status||'x'||count(*)::text AS k
    FROM vgp_regulatory_profiles GROUP BY classification_status) t;`);
  assert(byStatus === 'automaticx18 manual_onlyx1 requires_confirmationx5',
    `status distribution is automatic:18 requires_confirmation:5 manual_only:1 (got ${byStatus})`);

  // --- The interval-presence rule, both directions.
  assert(one(`SELECT count(*) FROM vgp_regulatory_profiles
              WHERE classification_status = 'manual_only'
                AND default_interval_months IS NOT NULL;`) === '0',
    'no manual_only profile carries an interval');
  assert(one(`SELECT count(*) FROM vgp_regulatory_profiles
              WHERE classification_status <> 'manual_only'
                AND default_interval_months IS NULL;`) === '0',
    'every non-manual profile carries an interval');
  assert(/ERROR/i.test(psql(`INSERT INTO vgp_regulatory_profiles
      (code,name,default_interval_months,classification_status)
      VALUES ('bad-manual','Bad',6,'manual_only');`)),
    'CHECK rejects a manual_only row WITH an interval');
  assert(/ERROR/i.test(psql(`INSERT INTO vgp_regulatory_profiles
      (code,name,default_interval_months,classification_status)
      VALUES ('bad-auto','Bad',NULL,'automatic');`)),
    'CHECK rejects a non-manual row WITHOUT an interval');

  // --- Every row carries a citation and a checked date.
  assert(one(`SELECT count(*) FROM vgp_regulatory_profiles
              WHERE regulatory_reference IS NULL OR btrim(regulatory_reference)='';`) === '0',
    'every profile cites a regulatory basis');
  assert(one(`SELECT count(*) FROM vgp_regulatory_profiles
              WHERE source_url IS NULL OR source_checked_at IS NULL;`) === '0',
    'every profile has a source URL and a checked date');
  assert(one(`SELECT count(*) FROM vgp_regulatory_profiles
              WHERE source_checked_at::date <> DATE '2026-09-14';`) === '0',
    'source_checked_at is 2026-09-14 on every row');

  // --- requires_confirmation rows must say WHAT to confirm.
  assert(one(`SELECT count(*) FROM vgp_regulatory_profiles
              WHERE classification_status='requires_confirmation'
                AND (usage_condition IS NULL OR btrim(usage_condition)='');`) === '0',
    'every requires_confirmation profile states its condition');

  // --- THE INVARIANT: the 625 (here 6) are untouched.
  assert(one('SELECT count(*) FROM vgp_schedules;') === before,
    'the seed created or deleted no schedule');
  assert(one("SELECT string_agg(interval_months::text, ',' ORDER BY interval_months) FROM vgp_schedules;")
         === intervalsBefore,
    `existing intervals unchanged (${intervalsBefore})`);
  assert(one('SELECT count(*) FROM vgp_schedules WHERE regulatory_profile_id IS NOT NULL;') === '0',
    'NO existing schedule was associated with a profile');
  assert(one(`SELECT count(*) FROM vgp_schedules WHERE regulatory_interval_months IS NOT NULL
              OR regulatory_reference_snapshot IS NOT NULL
              OR regulatory_profile_name_snapshot IS NOT NULL;`) === '0',
    'no snapshot column was backfilled on an existing schedule');

  // --- Positive control. The association query must be capable of reporting a
  //     non-zero count, or every assertion above is vacuous.
  psql(`UPDATE vgp_schedules SET regulatory_profile_id =
          (SELECT id FROM vgp_regulatory_profiles WHERE code='chariot-elevateur')
        WHERE id = (SELECT id FROM vgp_schedules LIMIT 1);`);
  assert(one('SELECT count(*) FROM vgp_schedules WHERE regulatory_profile_id IS NOT NULL;') === '1',
    'control: the same query DOES report an association when one is made');

  // --- Idempotence: re-running corrects rather than duplicates.
  psql(`UPDATE vgp_schedules SET regulatory_profile_id = NULL;`);
  psql(`UPDATE vgp_regulatory_profiles SET default_interval_months = 99
        WHERE code = 'chariot-elevateur';`);
  assert(!/ERROR/i.test(psql(upOf(SEED))), 'seed is re-runnable');
  assert(one('SELECT count(*) FROM vgp_regulatory_profiles;') === '24',
    're-running the seed does not duplicate rows');
  assert(one("SELECT default_interval_months FROM vgp_regulatory_profiles WHERE code='chariot-elevateur';")
         === '6', 're-running the seed corrects a drifted interval back to 6');

  done('S1_SEED_VERIFIED');
} finally {
  stopDb();
}
