// N6: recipients normalisation, in code and in the migration.
import { readdirSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';
import { loadTs } from './_load-ts.mjs';

const { normalizeRecipientsPref } = await loadTs('lib/vgp/notification-routing.ts');

// The bug: an array matched no case in the cron's switch and fell through to
// owner, silently narrowing ["admin"] and ["all"].
assert(normalizeRecipientsPref(['admin']) === 'admin', 'array ["admin"] -> admin (was silently owner)');
assert(normalizeRecipientsPref(['all']) === 'all', 'array ["all"] -> all (was silently owner)');
assert(normalizeRecipientsPref(['owner']) === 'owner', 'array ["owner"] -> owner');
assert(normalizeRecipientsPref('admin') === 'admin', 'string "admin" -> admin');
assert(normalizeRecipientsPref('all') === 'all', 'string "all" -> all');
assert(normalizeRecipientsPref('owner') === 'owner', 'string "owner" -> owner');
assert(normalizeRecipientsPref('manager') === 'owner', 'unknown role -> owner');
assert(normalizeRecipientsPref([]) === 'owner', 'empty array -> owner');
assert(normalizeRecipientsPref(null) === 'owner', 'null -> owner');
assert(normalizeRecipientsPref(undefined) === 'owner', 'undefined -> owner');

// The cron must actually use it.
const cron = read('app/api/cron/vgp-alerts/route.ts');
assert(/normalizeRecipientsPref\(/.test(cron), 'cron calls normalizeRecipientsPref');
assert(!/np\.vgp_alerts\?\.recipients \|\| "owner"/.test(cron), 'the old scalar-only read is gone');

// The migration must repair stored data.
const migs = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const hit = migs.filter((f) => /jsonb_set[\s\S]{0,200}vgp_alerts,recipients/i.test(read(`supabase/migrations/${f}`)));
assert(hit.length >= 1, `a migration rewrites the recipients key (found: ${hit.join(', ') || 'none'})`);
const t = read(`supabase/migrations/${hit[0]}`).split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
assert(/jsonb_typeof\([^)]*recipients'?\)\s*=\s*'array'/i.test(t), 'targets array-typed rows');
assert(/->>\s*0/.test(t), 'takes element 0 so ["admin"] becomes "admin", not the array text');
assert(/NOT IN \('owner', 'admin', 'all'\)/i.test(t), 'unknown values are normalised to a valid role');
done('N6_RECIPIENTS_VERIFIED');
