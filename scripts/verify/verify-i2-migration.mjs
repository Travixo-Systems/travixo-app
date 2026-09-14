// I2: migration shape and grants for record_inspection.
//
// The grant assertions are the point. working-agreements.md:44-53 records that
// Supabase default privileges grant EXECUTE on every new public function to
// anon, and that REVOKE ... FROM PUBLIC does not undo it -- PUBLIC and anon are
// different grantees. This was missed once already, on the assets-page
// functions. The live mirror shows it was missed here too, which is why I7
// re-checks against the mirror rather than against this text.
import { readdirSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';

const migs = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const hits = migs.filter((f) => /record_inspection/.test(read(`supabase/migrations/${f}`)));
assert(hits.length === 1, `exactly one migration defines record_inspection (got ${hits.length})`);
const f = hits[0];
assert(/^\d{14}_/.test(f), `14-digit timestamp prefix, per working-agreements.md:58 (${f})`);

const raw = read(`supabase/migrations/${f}`);
// Strip `--` comments before reasoning about statements: this migration carries
// a long rationale header that quotes the very SQL being asserted on.
const t = raw.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

assert(/SECURITY DEFINER/i.test(t), 'SECURITY DEFINER');
assert(/SET search_path TO 'public', 'pg_temp'/i.test(t), 'search_path pinned');
assert(/BEGIN;[\s\S]*COMMIT;/i.test(t), 'wrapped in an explicit transaction');

// Org scoping: the function must derive the org, never accept one.
assert(/get_my_organization_id\(\)/.test(t), 'org derived via get_my_organization_id()');
assert(!/p_organization_id/i.test(t), 'no organization_id parameter a caller could forge');
assert(/FOR UPDATE/i.test(t), 'asset row locked FOR UPDATE');

// Atomicity is structural: all three writes inside one function body.
assert(/INSERT INTO public\.vgp_inspections/i.test(t), 'inserts the inspection');
assert(/UPDATE public\.vgp_schedules/i.test(t), 'advances the schedule');
assert(/UPDATE public\.assets/i.test(t), 'updates the asset');

// Grants. The signature is long, so match on the leading keyword + function name.
const sig = String.raw`public\.record_inspection\(`;
assert(new RegExp(String.raw`REVOKE ALL ON FUNCTION ${sig}[^;]*\) FROM PUBLIC`, 'i').test(t),
  'revoked from PUBLIC');
assert(new RegExp(String.raw`REVOKE EXECUTE ON FUNCTION ${sig}[^;]*\) FROM anon`, 'i').test(t),
  'revoked from anon explicitly (default privileges grant it otherwise)');
assert(new RegExp(String.raw`GRANT EXECUTE ON FUNCTION ${sig}[^;]*\)\s*\n?\s*TO authenticated`, 'i').test(t),
  'granted to authenticated (the route calls it as the signed-in user)');

done('I2_MIGRATION_VERIFIED');
