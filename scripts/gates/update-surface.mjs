#!/usr/bin/env node
/**
 * UPDATE-SURFACE GATE
 *
 * Answers one question against a RUNNING database:
 *
 *     Which (table, column) pairs can role `authenticated` actually UPDATE
 *     in schema public -- and which can `anon`?
 *
 * ...then diffs that against scripts/gates/update-surface-allowlist.json.
 *
 * Why this is derived from the catalog and not from the schema files:
 * a grep over supabase/schemas/ tells you what someone WROTE. This asks the
 * database what it will actually PERMIT, which is the only thing an attacker
 * interacts with. This project already has gates that pass 23/23 against
 * broken runtime behaviour because they text-match; this one does not.
 *
 * The effective surface is the intersection of three things:
 *
 *   1. table-level UPDATE grant       (information_schema.role_table_grants)
 *   2. column-level UPDATE grants     (information_schema.column_privileges)
 *   3. at least one permissive policy FOR UPDATE or FOR ALL
 *
 * Postgres records a table-wide UPDATE grant as a column privilege on every
 * column, so (2) subsumes (1) -- but both are read, because the DIFFERENCE
 * between them is exactly the C-1 remediation: revoking the table-wide grant
 * and re-granting a subset of columns. The report shows which mechanism is
 * in play so a reviewer can see whether column-level control is actually on.
 *
 * A table with UPDATE grants but NO update policy has an empty effective
 * surface under RLS -- but it is reported as UNGATED-GRANT, because the grant
 * is live and one permissive policy away from being reachable.
 *
 * Usage:
 *   node scripts/gates/update-surface.mjs [--db <url>] [--json]
 *
 * Exit 0 = PASS, 1 = FAIL, 2 = could not run.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST = join(HERE, 'update-surface-allowlist.json');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const dbFlag = argv.indexOf('--db');
const DB_URL =
  dbFlag !== -1
    ? argv[dbFlag + 1]
    : process.env.GATE_DB_URL ||
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Local-stack credentials only. Refuse anything that looks remote, so this
// gate can never be pointed at production by accident.
if (!/@(127\.0\.0\.1|localhost|db|host\.docker\.internal)[:/]/.test(DB_URL)) {
  console.error(
    'REFUSING: update-surface gate runs against a local database only.\n' +
      'Got a non-local host. This gate reads the catalog, but it is a ' +
      'verification tool and must not be aimed at production.'
  );
  process.exit(2);
}

// ---------------------------------------------------------------- query ----
// One query, emitted as tab-separated rows.
const SQL = `
WITH upd_policy AS (
  -- Tables carrying at least one policy that admits UPDATE, per grantee role.
  SELECT DISTINCT
    c.relname::text AS table_name,
    r.rolname::text  AS grantee
  FROM pg_policy p
  JOIN pg_class c      ON c.oid = p.polrelid
  JOIN pg_namespace n  ON n.oid = c.relnamespace
  CROSS JOIN LATERAL (
    SELECT unnest(
      CASE
        WHEN p.polroles = '{0}'::oid[]           -- TO PUBLIC
        THEN ARRAY[
          (SELECT oid FROM pg_roles WHERE rolname='anon'),
          (SELECT oid FROM pg_roles WHERE rolname='authenticated')
        ]
        ELSE p.polroles
      END
    ) AS roleoid
  ) expanded
  JOIN pg_roles r ON r.oid = expanded.roleoid
  WHERE n.nspname = 'public'
    AND p.polpermissive                          -- permissive only; restrictive narrows
    AND p.polcmd IN ('*','w')                    -- '*' = ALL, 'w' = UPDATE
    AND r.rolname IN ('anon','authenticated')
),
col_grant AS (
  -- Column-level UPDATE privilege. A table-wide GRANT UPDATE shows up here
  -- once per column, so this is the effective column set either way.
  SELECT
    cp.table_name::text,
    cp.column_name::text,
    cp.grantee::text
  FROM information_schema.column_privileges cp
  WHERE cp.table_schema = 'public'
    AND cp.privilege_type = 'UPDATE'
    AND cp.grantee IN ('anon','authenticated')
),
tbl_grant AS (
  -- Table-level UPDATE grant, kept separate so the report can say whether
  -- column-level control is actually in force.
  SELECT
    tg.table_name::text,
    tg.grantee::text
  FROM information_schema.role_table_grants tg
  WHERE tg.table_schema = 'public'
    AND tg.privilege_type = 'UPDATE'
    AND tg.grantee IN ('anon','authenticated')
)
SELECT
  cg.grantee,
  cg.table_name,
  cg.column_name,
  (up.table_name IS NOT NULL) AS has_update_policy,
  (tg.table_name IS NOT NULL) AS has_table_wide_grant
FROM col_grant cg
LEFT JOIN upd_policy up
       ON up.table_name = cg.table_name AND up.grantee = cg.grantee
LEFT JOIN tbl_grant tg
       ON tg.table_name = cg.table_name AND tg.grantee = cg.grantee
ORDER BY cg.grantee, cg.table_name, cg.column_name;
`;

function query(sql) {
  // Prefer a container exec when the CLI stack is up; fall back to local psql.
  const attempts = [
    {
      cmd: 'docker',
      args: [
        'exec', '-i', 'supabase_db_travixo-app',
        'psql', '-U', 'postgres', '-d', 'postgres',
        '-At', '-F', '\t', '-c', sql,
      ],
    },
    { cmd: 'psql', args: [DB_URL, '-At', '-F', '\t', '-c', sql] },
  ];
  let lastErr;
  for (const a of attempts) {
    try {
      return execFileSync(a.cmd, a.args, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (e) {
      lastErr = e;
    }
  }
  console.error('Could not reach the local database.');
  console.error(String(lastErr?.stderr || lastErr?.message || lastErr).trim());
  console.error('\nIs the local Supabase stack running? (npx supabase start)');
  process.exit(2);
}

// ----------------------------------------------------------------- main ----
const raw = query(SQL);

const rows = raw
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const [grantee, table, column, hasPolicy, tableWide] = l.split('\t');
    return {
      grantee,
      table,
      column,
      hasPolicy: hasPolicy === 't',
      tableWide: tableWide === 't',
    };
  });

const allow = JSON.parse(readFileSync(ALLOWLIST, 'utf8'));
// Strip documentation keys ($comment, $comment_users, ...). They carry the
// reasoning for each decision and must never be mistaken for table names.
const allowAuth = Object.fromEntries(
  Object.entries(allow.authenticated || {}).filter(
    ([k, v]) => !k.startsWith('$') && Array.isArray(v)
  )
);
const allowed = (table, column) => {
  const cols = allowAuth[table];
  return Array.isArray(cols) && cols.includes(column);
};

// Effective = grant AND a policy that admits UPDATE.
const effective = rows.filter((r) => r.hasPolicy);
const ungatedGrant = rows.filter((r) => !r.hasPolicy);

const anonEffective = effective.filter((r) => r.grantee === 'anon');
const authEffective = effective.filter((r) => r.grantee === 'authenticated');

const violations = authEffective.filter((r) => !allowed(r.table, r.column));

// Stale entries: allowlisted but not actually reachable. Not a failure --
// it is what a correct remediation looks like -- but worth surfacing.
const reachable = new Set(authEffective.map((r) => `${r.table}.${r.column}`));
const stale = [];
for (const [t, cols] of Object.entries(allowAuth)) {
  if (!Array.isArray(cols)) continue;
  for (const c of cols) if (!reachable.has(`${t}.${c}`)) stale.push(`${t}.${c}`);
}

const anonTablesWithGrant = [...new Set(rows.filter(r => r.grantee === 'anon').map(r => r.table))];
const colControlled = [...new Set(authEffective.filter((r) => !r.tableWide).map((r) => r.table))];

const pass = violations.length === 0 && anonEffective.length === 0;

if (asJson) {
  console.log(JSON.stringify({
    pass,
    violations,
    anonEffective,
    ungatedGrantTables: [...new Set(ungatedGrant.map((r) => `${r.grantee}:${r.table}`))],
    stale,
    counts: {
      authEffective: authEffective.length,
      anonEffective: anonEffective.length,
      violations: violations.length,
    },
  }, null, 2));
  process.exit(pass ? 0 : 1);
}

const B = (s) => `\x1b[1m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;

console.log(B('\n  UPDATE-SURFACE GATE'));
console.log('  ' + '-'.repeat(68));
console.log(`  Derived from the live catalog: column grants x UPDATE/ALL policies.`);
console.log(`  Effective authenticated pairs: ${authEffective.length}`);
console.log(`  Effective anon pairs:          ${anonEffective.length}`);
console.log(`  Allowlisted pairs:             ${Object.values(allowAuth).filter(Array.isArray).flat().length}`);
console.log(`  Column-level control active:   ${colControlled.length ? colControlled.join(', ') : R('none - every table is a table-wide grant')}`);

if (anonEffective.length) {
  console.log(R(B('\n  FAIL - anon has a writable surface (must be empty)')));
  const byTable = {};
  for (const r of anonEffective) (byTable[r.table] ||= []).push(r.column);
  for (const [t, cols] of Object.entries(byTable)) {
    console.log(R(`    ${t}`) + `  (${cols.length} cols)  ${cols.slice(0, 8).join(', ')}${cols.length > 8 ? ', ...' : ''}`);
  }
}

if (violations.length) {
  console.log(R(B(`\n  FAIL - ${violations.length} authenticated pair(s) not on the allowlist`)));
  const byTable = {};
  for (const v of violations) (byTable[v.table] ||= []).push(v.column);
  for (const [t, cols] of Object.entries(byTable).sort()) {
    console.log(R(`\n    ${t}`));
    for (const c of cols.sort()) {
      const note =
        (t === 'users' && c === 'role') ? '  <- C-1 privilege escalation' :
        (t === 'users' && c === 'organization_id') ? '  <- C-1 tenant escape' :
        (t === 'organizations' && ['converted_to_paid','is_pilot','pilot_start_date','pilot_end_date','trial_ends_at','subscription_tier','subscription_status'].includes(c)) ? '  <- C-2 billing authority' :
        (t === 'organizations' && c === 'stripe_customer_id') ? '  <- C-2 billing identity' :
        (t === 'organizations' && c === 'feature_flags') ? '  <- entitlement' :
        (t === 'subscriptions') ? '  <- C-2 billing authority' :
        '';
      console.log(`      ${c}${R(note)}`);
    }
  }
}

if (ungatedGrant.length) {
  const tables = [...new Set(ungatedGrant.map((r) => `${r.grantee}:${r.table}`))];
  console.log(Y(`\n  NOTE - ${tables.length} grant(s) with no UPDATE policy (dormant, not reachable):`));
  console.log('    ' + tables.join(', '));
  console.log(Y('    Dormant, not safe: one permissive policy away from live.'));
}

if (stale.length) {
  console.log(Y(`\n  NOTE - ${stale.length} allowlisted pair(s) not currently reachable:`));
  console.log('    ' + stale.slice(0, 12).join(', ') + (stale.length > 12 ? ', ...' : ''));
  console.log(Y('    Expected after remediation narrows the surface. Prune when settled.'));
}

console.log();
if (pass) {
  console.log(G(B('  PASS - update surface matches the allowlist')) + '\n');
  process.exit(0);
}
console.log(R(B('  FAIL - update surface exceeds the allowlist')) + '\n');
process.exit(1);
