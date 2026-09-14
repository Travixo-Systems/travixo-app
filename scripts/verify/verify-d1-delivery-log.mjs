// D1: the delivery log removes the empty-queue ambiguity, proven against a
// real Postgres.
//
// The claim under test is a NEGATIVE one -- "an empty queue no longer means
// nothing was sent" -- so the fixture must be able to exhibit the ambiguity
// before the table exists, or the assertions prove nothing. It reproduces the
// old behaviour first (queue drained, zero evidence), then shows the log
// surviving the same drain.
import { readFileSync } from 'node:fs';
import { assert, done } from './_util.mjs';
import { dockerAvailable, startDb, stopDb, psql } from './_pgprobe.mjs';

if (!dockerAvailable()) {
  console.error('FAIL: Docker unavailable - this gate must run a real Postgres');
  process.exit(1);
}

const MIG = 'supabase/migrations/20260914150000_vgp_digest_deliveries.sql';
const up = readFileSync(MIG, 'utf8').split('-- DOWN')[0];

const ROLES = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN; CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;`;

const USER = '00000000-0000-0000-0000-0000000000c1';
const ORG = '00000000-0000-0000-0000-0000000000a1';

const SCHEMA = `
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE users(id uuid PRIMARY KEY, email text);
CREATE TABLE pending_weekly_digests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE);
INSERT INTO organizations VALUES ('${ORG}');
INSERT INTO users VALUES ('${USER}', 'owner@example.invalid');`;

const one = (sql) => psql(sql).trim();
const queueThree = () => psql(`INSERT INTO pending_weekly_digests(user_id, organization_id)
  SELECT '${USER}', '${ORG}' FROM generate_series(1,3);`);

startDb();
try {
  psql(ROLES);
  assert(!/ERROR/i.test(psql(SCHEMA)), 'fixture builds');

  // --- Reproduce the ambiguity the table exists to remove. Without a log, a
  //     drained queue is indistinguishable from one that never had rows.
  queueThree();
  assert(one('SELECT count(*) FROM pending_weekly_digests;') === '3', 'three items queued');
  psql('DELETE FROM pending_weekly_digests;');           // what a successful send does
  const drained = one('SELECT count(*) FROM pending_weekly_digests;');
  assert(drained === '0', 'queue drains to 0 after a send');
  assert(one(`SELECT count(*) FROM information_schema.tables
              WHERE table_name = 'vgp_digest_deliveries';`) === '0',
    'CONTROL: before the migration there is no artifact at all, so 0 rows is ambiguous');

  // --- Apply the migration.
  const applied = psql(up);
  assert(!/ERROR/i.test(applied), `migration applies (got: ${applied.trim().slice(0, 160)})`);
  assert(!/ERROR/i.test(psql(up)), 'migration is re-runnable');

  // --- The log survives the drain.
  queueThree();
  psql(`INSERT INTO vgp_digest_deliveries
        (user_id, organization_id, recipient_email, period, item_count, provider_message_id)
        VALUES ('${USER}','${ORG}','owner@example.invalid','weekly',3,'re_testmessageid01');`);
  psql('DELETE FROM pending_weekly_digests;');
  assert(one('SELECT count(*) FROM pending_weekly_digests;') === '0', 'queue drained again');
  assert(one('SELECT count(*) FROM vgp_digest_deliveries;') === '1',
    'the delivery record SURVIVES the drain - the ambiguity is gone');
  assert(one("SELECT provider_message_id FROM vgp_digest_deliveries;") === 're_testmessageid01',
    'the Resend message id is retained for provider lookup');

  // --- Constraints.
  assert(/ERROR/i.test(psql(`INSERT INTO vgp_digest_deliveries
      (recipient_email, period, item_count) VALUES ('x@y.invalid','monthly',1);`)),
    'CHECK rejects an unknown period');
  assert(/ERROR/i.test(psql(`INSERT INTO vgp_digest_deliveries
      (recipient_email, period, item_count) VALUES ('x@y.invalid','weekly',0);`)),
    'CHECK rejects an empty digest (item_count 0)');
  assert(!/ERROR/i.test(psql(`INSERT INTO vgp_digest_deliveries
      (recipient_email, period, item_count, provider_message_id)
      VALUES ('x@y.invalid','weekly',1,NULL);`)),
    'a delivery with no provider id is still recordable');

  // --- Evidence must outlive the user. This is the whole point of
  //     ON DELETE SET NULL rather than CASCADE.
  psql(`DELETE FROM pending_weekly_digests;`);
  psql(`DELETE FROM users WHERE id = '${USER}';`);
  assert(one(`SELECT count(*) FROM vgp_digest_deliveries
              WHERE recipient_email = 'owner@example.invalid';`) === '1',
    'deleting the user does NOT erase the delivery record');
  assert(one(`SELECT user_id IS NULL FROM vgp_digest_deliveries
              WHERE recipient_email = 'owner@example.invalid';`) === 't',
    'the user reference is nulled, the address is kept');

  // --- Grants: read-only to authenticated, nothing for anon.
  assert(one(`SELECT coalesce(string_agg(privilege_type, ','), 'NONE')
              FROM information_schema.role_table_grants
              WHERE grantee = 'anon' AND table_name = 'vgp_digest_deliveries';`) === 'NONE',
    'anon holds no privilege on the delivery log');
  assert(one(`SELECT coalesce(string_agg(privilege_type, ','), 'NONE')
              FROM information_schema.role_table_grants
              WHERE grantee = 'authenticated' AND table_name = 'vgp_digest_deliveries';`) === 'SELECT',
    'authenticated holds SELECT only - the cron writes through service_role');
  assert(one(`SELECT count(*) FROM pg_policies
              WHERE tablename = 'vgp_digest_deliveries' AND cmd <> 'SELECT';`) === '0',
    'no INSERT/UPDATE/DELETE policy exists');

  done('D1_DELIVERY_LOG_VERIFIED');
} finally {
  stopDb();
}
