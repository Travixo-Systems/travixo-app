// N11: Session 1 guarantees must still hold after this feature's rewrite.
import { read, assert, done } from './_util.mjs';

const cron = read('app/api/cron/vgp-alerts/route.ts');

// Demo exclusion.
assert(/assets!inner/.test(cron), 'inner join retained');
assert(/\.eq\("assets\.is_demo_data",\s*false\)/.test(cron), 'query-level demo filter retained');
assert(/isDemoSchedule/.test(cron), 'post-fetch demo safety net retained');
assert(/eligibleSchedules/.test(cron), 'filtered array still drives the org grouping');

// .test suppression.
assert(/isUndeliverableEmail/.test(cron), '.test recipient suppression retained');

// Claim-then-send.
const digestLoop = cron.indexOf('for (const [level, items] of byUrgency)');
assert(digestLoop !== -1, 'digest loop located');
const block = cron.slice(digestLoop, cron.indexOf('runClientRecallPass'));
const claimAt = block.search(/\.from\("vgp_alerts"\)\s*\n?\s*\.upsert/);
assert(claimAt !== -1, 'the vgp_alerts claim is still an upsert');
assert(/ignoreDuplicates:\s*true/.test(block), 'ON CONFLICT DO NOTHING retained');
assert(/onConflict:\s*"schedule_id,alert_type,alert_date"/.test(block), 'unique index still arbitrates');
// The claim must still precede any send in the whole run.
// Claim-before-send is now a RUNTIME ordering across two functions, not a
// source ordering: deliverToRecipients() is defined above runVGPAlertsCron()
// but called after the claim, so comparing character offsets proves nothing.
// Assert the call graph instead.
const deliverCallAt = cron.search(/await deliverToRecipients\(/);
assert(deliverCallAt !== -1, 'deliverToRecipients is called');
assert(digestLoop < deliverCallAt,
  'delivery is invoked AFTER the claim loop, so nothing sends unclaimed');
assert(/claimedGroups\.push\(/.test(block), 'only claimed items are collected for delivery');
assert(/groups:\s*claimedGroups/.test(cron),
  'deliverToRecipients receives the claimed groups, not the raw batch');

const deliverFn = cron.slice(
  cron.indexOf('async function deliverToRecipients'),
  cron.indexOf('export async function runVGPAlertsCron')
);
assert(deliverFn.length > 0, 'deliverToRecipients body located');
assert(!/\.from\("vgp_alerts"\)\s*\n?\s*\.upsert/.test(deliverFn),
  'delivery does not re-claim; the claim stays single-sourced in the digest loop');

// FREQUENCY_RULES unchanged in substance.
assert(/cooldownDays:\s*1,\s*alertType:\s*"overdue"/.test(cron), 'overdue rule intact');
assert(/preferenceDay:\s*0/.test(cron), 'overdue preferenceDay 0 intact');

// Welcome-email guard untouched.
const post = read('app/api/internal/post-registration/route.ts');
assert(/claimOneShotEmail\(\s*orgId,\s*'welcome_email_sent'\s*\)/.test(post), 'welcome claim retained');
assert(/\.eq\(column,\s*false\)/.test(post), 'atomic conditional UPDATE retained');
done('N11_SESSION1_INTACT');
