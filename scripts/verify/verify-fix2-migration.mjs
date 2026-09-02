// G5: dedup migration — cleanup MUST precede index creation, index MUST be unique+partial.
import { readdirSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';

const migs = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const hits = migs.filter((f) => /idx_vgp_alerts_dedup_unique/.test(read(`supabase/migrations/${f}`)));
assert(hits.length === 1, `exactly one migration creates idx_vgp_alerts_dedup_unique (found ${hits.length})`);
if (!hits.length) done('FIX2_MIGRATION_VERIFIED');

const f = hits[0];
const raw = read(`supabase/migrations/${f}`);
assert(/^\d{14}_/.test(f), `timestamp prefix (${f})`);

// Strip `--` comments before reasoning about statement ORDER. These migrations
// carry long rationale headers that quote the very SQL being checked, so
// searching the raw text finds the commentary, not the executed statement.
const t = raw.split('\n').filter((line) => !/^\s*--/.test(line)).join('\n');

const delAt = t.search(/DELETE\s+FROM\s+(public\.)?vgp_alerts/i);
const idxAt = t.search(/CREATE\s+UNIQUE\s+INDEX/i);
assert(delAt !== -1, 'duplicate cleanup DELETE present');
assert(idxAt !== -1, 'CREATE UNIQUE INDEX present');
assert(delAt !== -1 && idxAt !== -1 && delAt < idxAt,
  'cleanup is ordered BEFORE index creation (index would fail on existing duplicates)');

assert(/DISTINCT\s+ON\s*\(\s*schedule_id\s*,\s*alert_type\s*,\s*alert_date\s*\)/i.test(t),
  'cleanup keeps one row per (schedule_id, alert_type, alert_date)');
assert(/ORDER\s+BY[\s\S]{0,120}sent_at\s+DESC/i.test(t), 'cleanup keeps the most recent row');
assert(/ON\s+(public\.)?vgp_alerts\s*\(\s*schedule_id\s*,\s*alert_type\s*,\s*alert_date\s*\)/i.test(t)
    || /ON\s+(public\.)?vgp_alerts\s+USING\s+btree\s*\(\s*schedule_id\s*,\s*alert_type\s*,\s*alert_date\s*\)/i.test(t),
  'index columns are (schedule_id, alert_type, alert_date)');
assert(/WHERE\s*\(?\s*sent\s*=\s*true/i.test(t), 'index is partial on sent = true');
assert(/sent\s*=\s*true/i.test(t.slice(delAt, idxAt)), 'cleanup is scoped to sent = true rows only');
done('FIX2_MIGRATION_VERIFIED');
