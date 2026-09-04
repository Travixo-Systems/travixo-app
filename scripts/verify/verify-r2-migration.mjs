// R2: migration shape and grants.
import { readdirSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';

const migs = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const hits = migs.filter((f) => /claim_vgp_alerts/.test(read(`supabase/migrations/${f}`)));
assert(hits.length === 1, `exactly one migration defines claim_vgp_alerts (got ${hits.length})`);
const f = hits[0];
assert(/^\d{14}_/.test(f), `timestamp prefix (${f})`);

const raw = read(`supabase/migrations/${f}`);
const t = raw.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

assert(/ON CONFLICT \(schedule_id, alert_type, alert_date\)\s+WHERE\s+vgp_alerts\.sent = true/i.test(t),
  'the index predicate is repeated in the conflict target, qualified to the table');
assert(/SECURITY DEFINER/i.test(t), 'SECURITY DEFINER');
assert(/SET search_path TO 'public', 'pg_temp'/i.test(t), 'search_path pinned');
assert(/DROP FUNCTION IF EXISTS public\.claim_vgp_alerts/i.test(t),
  'drops first so a return-type change stays re-runnable');
assert(/RETURNS TABLE \(out_id UUID, out_schedule_id UUID\)/i.test(t),
  'out_* column names avoid PL/pgSQL variable ambiguity');

// Grants: service_role only.
assert(/REVOKE ALL ON FUNCTION public\.claim_vgp_alerts\(JSONB\) FROM PUBLIC/i.test(t), 'revoked from PUBLIC');
assert(/REVOKE EXECUTE ON FUNCTION public\.claim_vgp_alerts\(JSONB\) FROM anon/i.test(t),
  'revoked from anon explicitly (default privileges grant it otherwise)');
assert(/REVOKE EXECUTE ON FUNCTION public\.claim_vgp_alerts\(JSONB\) FROM authenticated/i.test(t),
  'revoked from authenticated');
assert(/GRANT EXECUTE ON FUNCTION public\.claim_vgp_alerts\(JSONB\) TO service_role/i.test(t),
  'granted to service_role');
assert(!/TO authenticated/i.test(t.replace(/REVOKE[^;]*;/gi, '')), 'authenticated is never granted');
done('R2_MIGRATION_VERIFIED');
