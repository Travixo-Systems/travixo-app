// Run SQL against a throwaway Postgres container.
//
// This exists because the previous 19 gates verified SQL by reading it as text.
// A gate that asserts a migration CONTAINS "CREATE UNIQUE INDEX ... WHERE" says
// nothing about whether the application's INSERT can use that index -- which is
// exactly the defect that reached production. These gates execute statements.
//
// Docker rather than a Postgres npm client: no new dependency, and a container
// is a real server rather than a parser.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const CONTAINER = 'vgpgate-pg';

function sh(args, opts = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

export function dockerAvailable() {
  try { sh(['version', '--format', '{{.Server.Version}}']); return true; } catch { return false; }
}

/** Start a clean container with the production vgp_alerts shape loaded. */
export function startDb() {
  try { sh(['rm', '-f', CONTAINER]); } catch { /* not running */ }
  sh(['run', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=probe', 'postgres:15-alpine']);
  // Busy-wait rather than shelling out to sleep/timeout: `timeout` fails on
  // Windows without an interactive console, and this keeps the gate portable.
  const deadline = Date.now() + 60_000;
  for (;;) {
    try { sh(['exec', CONTAINER, 'pg_isready', '-U', 'postgres']); return; }
    catch { /* not ready */ }
    if (Date.now() > deadline) throw new Error('Postgres container never became ready');
    const until = Date.now() + 500;
    while (Date.now() < until) { /* spin */ }
  }
}

export function stopDb() {
  try { sh(['rm', '-f', CONTAINER]); } catch { /* already gone */ }
}

/**
 * Execute SQL, returning stdout AND stderr combined. Never throws on SQL error.
 *
 * psql writes ERROR lines to stderr and still exits 0 without ON_ERROR_STOP, so
 * a gate reading only stdout sees an empty string where a failure occurred --
 * and an assertion looking for "42P10" would report the error as absent. Both
 * streams are merged here so a SQL error is visible to the caller.
 */
export function psql(sql) {
  try {
    const out = execFileSync('docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
      { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return out;
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}


/** The production table + partial index, as recorded in the schema mirror. */
export const SCHEMA = `
DROP TABLE IF EXISTS vgp_alerts CASCADE;
CREATE TABLE vgp_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid, asset_id uuid, organization_id uuid,
  alert_type text NOT NULL, urgency_level text,
  alert_date date NOT NULL, due_date date NOT NULL,
  sent boolean DEFAULT false, sent_at timestamptz,
  email_sent_to text[], resolved boolean DEFAULT false
);
CREATE UNIQUE INDEX idx_vgp_alerts_dedup_unique
  ON vgp_alerts (schedule_id, alert_type, alert_date) WHERE (sent = true);
`;

/** Load the real migration, minus grants the container's roles lack. */
export function loadMigration(path) {
  const sql = readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(REVOKE|GRANT)\b/.test(l))
    .join('\n');
  return psql(sql);
}
