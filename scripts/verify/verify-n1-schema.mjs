// N1: user_notification_preferences migration.
import { readdirSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';

const migs = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const hits = migs.filter((f) => /CREATE TABLE[\s\S]{0,80}user_notification_preferences/i.test(read(`supabase/migrations/${f}`)));
assert(hits.length === 1, `exactly one migration creates the table (got ${hits.length})`);
if (!hits.length) done('N1_SCHEMA_VERIFIED');

const f = hits[0];
const raw = read(`supabase/migrations/${f}`);
const t = raw.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
assert(/^\d{14}_/.test(f), `timestamp prefix (${f})`);

assert(/vgp_frequency\s+TEXT\s+NOT NULL\s+DEFAULT\s+'daily_digest'/i.test(t), 'vgp_frequency NOT NULL default daily_digest');
assert(/vgp_thresholds\s+INTEGER\[\]\s+NOT NULL\s+DEFAULT\s+'\{30,15,7,1,0\}'/i.test(t), 'vgp_thresholds NOT NULL with the full default set');
assert(/CHECK\s*\(\s*vgp_frequency IN \('immediate',\s*'daily_digest',\s*'weekly_digest',\s*'off'\)/i.test(t), 'CHECK constrains vgp_frequency to the four modes');
assert(/UNIQUE\s*\(\s*user_id,\s*organization_id\s*\)/i.test(t), 'UNIQUE (user_id, organization_id)');
assert(/REFERENCES public\.users\(id\) ON DELETE CASCADE/i.test(t), 'user FK cascades');
assert(/REFERENCES public\.organizations\(id\) ON DELETE CASCADE/i.test(t), 'organization FK cascades');

// RLS
assert(/ENABLE ROW LEVEL SECURITY/i.test(t), 'RLS enabled');
assert(/FOR SELECT[\s\S]{0,120}user_id = auth\.uid\(\)/i.test(t), 'SELECT restricted to own row');
assert(/FOR UPDATE[\s\S]{0,200}user_id = auth\.uid\(\)/i.test(t), 'UPDATE restricted to own row');
const ins = t.slice(t.search(/FOR INSERT/i));
assert(/user_id = auth\.uid\(\)/i.test(ins), 'INSERT restricted to own row');
assert(/EXISTS\s*\([\s\S]{0,240}public\.users[\s\S]{0,200}organization_id/i.test(ins),
  'INSERT verifies org membership via the users table');

// anon must hold nothing - default privileges in this project grant it otherwise.
assert(/REVOKE ALL ON TABLE public\.user_notification_preferences FROM anon/i.test(t),
  'anon is explicitly revoked (project default privileges grant it otherwise)');
assert(/GRANT[^;]*TO authenticated/i.test(t), 'authenticated is granted');

done('N1_SCHEMA_VERIFIED');
