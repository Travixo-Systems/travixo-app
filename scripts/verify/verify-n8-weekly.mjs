// N8: weekly digest route + pending table.
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';

assert(existsSync('app/api/cron/vgp-weekly-digest/route.ts'), 'weekly cron route exists');
const r = read('app/api/cron/vgp-weekly-digest/route.ts');

assert(/getUTCDay\(\)/.test(r), 'gates on the UTC weekday');
assert(/MONDAY_UTC\s*=\s*1/.test(r), 'Monday is 1 in getUTCDay terms');
const gateAt = r.search(/day !== MONDAY_UTC/);
const queryAt = r.search(/\.from\("pending_weekly_digests"\)/);
assert(gateAt !== -1 && queryAt !== -1 && gateAt < queryAt,
  'the Monday gate returns BEFORE any query (non-Monday runs cost nothing)');
assert(/CRON_SECRET/.test(r), 'protected by CRON_SECRET');
assert(/maxDuration/.test(r), 'declares a duration ceiling');

// One email per user.
assert(/byUser/.test(r), 'rows are grouped by user');
assert(/sendVGPWeeklyDigest/.test(r), 'sends via the weekly digest sender');

// Clear only after a successful send - order matters.
//
// Scoped to the send block: the route also deletes rows for users that no
// longer exist, and that earlier delete would otherwise satisfy the search.
const sendAt = r.search(/await sendVGPWeeklyDigest\(/);
assert(sendAt !== -1, 'the weekly send call is present');
const afterSend = r.slice(sendAt);
const clearAt = afterSend.search(/\.delete\(\)[\s\S]{0,160}rows\.map/);
assert(clearAt !== -1, 'the queue clear happens AFTER the send, not before');
assert(/!sendResult\.success[\s\S]{0,500}continue;/.test(afterSend),
  'a failed send leaves rows queued for retry rather than dropping them');
// The failure branch must come before the clear, so a failure skips it.
const failAt = afterSend.search(/!sendResult\.success/);
assert(failAt !== -1 && failAt < clearAt, 'the failure branch short-circuits before the clear');

// vercel.json registration.
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const cron = vercel.crons.find((c) => c.path === '/api/cron/vgp-weekly-digest');
assert(Boolean(cron), 'registered in vercel.json');
assert(/^\S+ \S+ \* \* \*$/.test(cron.schedule),
  `daily schedule for Hobby-plan compatibility (got "${cron.schedule}")`);
assert(vercel.crons.some((c) => c.path === '/api/cron/vgp-alerts'), 'the daily alert cron is still registered');

// Pending table migration.
const migs = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const hit = migs.filter((f) => /CREATE TABLE[\s\S]{0,80}pending_weekly_digests/i.test(read(`supabase/migrations/${f}`)));
assert(hit.length === 1, `exactly one migration creates pending_weekly_digests (got ${hit.length})`);
const t = read(`supabase/migrations/${hit[0]}`).split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
assert(/UNIQUE \(user_id, schedule_id, alert_type\)/i.test(t),
  'UNIQUE (user_id, schedule_id, alert_type) makes daily accumulation idempotent');
assert(/ENABLE ROW LEVEL SECURITY/i.test(t), 'RLS enabled');
assert(/REVOKE ALL ON TABLE public\.pending_weekly_digests FROM anon/i.test(t), 'anon revoked');
assert(/ON DELETE CASCADE/i.test(t), 'FKs cascade');

// The daily cron must queue rather than send for weekly users.
const cronSrc = read('app/api/cron/vgp-alerts/route.ts');
assert(/pending_weekly_digests[\s\S]{0,400}ignoreDuplicates:\s*true/.test(cronSrc),
  'daily cron queues weekly rows with ignoreDuplicates (once per week, not once per day)');
done('N8_WEEKLY_VERIFIED');
