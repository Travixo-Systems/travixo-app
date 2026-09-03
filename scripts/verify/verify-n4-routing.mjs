// N4: the three delivery scenarios named in the brief, plus immediate.
//
//   daily_digest -> ONE merged email, not one per threshold
//   off          -> nothing at all
//   no row       -> org defaults
//   immediate    -> per-band sends, as before
//
// Counted as emails, because "one grouped email rather than per-threshold" is a
// claim about how many messages arrive, and nothing weaker proves it.
import { assert, done } from './_util.mjs';
import { loadTs } from './_load-ts.mjs';

const m = await loadTs('lib/vgp/notification-routing.ts');
const { resolveRecipientPreference, planDelivery, countItems } = m;

const orgOn = { timing: [30, 15, 7, 1], enabled: true };

// Four bands due at once for this org - the situation that used to mean four
// separate emails to every recipient.
const groups = [
  { preferenceDay: 30, alertType: 'reminder_30day', urgencyLevel: 'planning',  items: [{ id: 'a' }, { id: 'b' }] },
  { preferenceDay: 15, alertType: 'reminder_15day', urgencyLevel: 'attention', items: [{ id: 'c' }] },
  { preferenceDay: 7,  alertType: 'reminder_7day',  urgencyLevel: 'urgent',    items: [{ id: 'd' }] },
  { preferenceDay: 1,  alertType: 'reminder_1day',  urgencyLevel: 'critical',  items: [{ id: 'e' }] },
];

/** Emails a plan produces in THIS run (weekly defers, so it sends none now). */
function emailsThisRun(plan) {
  return plan.immediate.length + (plan.dailyDigest.length > 0 ? 1 : 0);
}

// --- Scenario 1: daily_digest -> exactly one email, all thresholds merged ---
const daily = resolveRecipientPreference(
  { user_id: 'u1', organization_id: 'o1', vgp_frequency: 'daily_digest', vgp_thresholds: [30, 15, 7, 1, 0] },
  orgOn);
const dailyPlan = planDelivery(groups, daily);
assert(emailsThisRun(dailyPlan) === 1, `daily_digest yields exactly ONE email (got ${emailsThisRun(dailyPlan)})`);
assert(dailyPlan.immediate.length === 0, 'daily_digest sends nothing through the per-band path');
assert(dailyPlan.dailyDigest.length === 4, `all four bands land in the digest (got ${dailyPlan.dailyDigest.length})`);
assert(countItems(dailyPlan.dailyDigest) === 5, `digest carries all 5 items (got ${countItems(dailyPlan.dailyDigest)})`);
assert(dailyPlan.weeklyPending.length === 0, 'daily_digest defers nothing to the weekly run');

// Control: without the feature this recipient would have received four emails.
assert(groups.length === 4 && emailsThisRun(dailyPlan) < groups.length,
  'the digest is strictly fewer emails than the per-band behaviour it replaces');

// --- Scenario 2: off -> nothing ---
const off = resolveRecipientPreference(
  { user_id: 'u2', organization_id: 'o1', vgp_frequency: 'off', vgp_thresholds: [30, 15, 7, 1, 0] },
  orgOn);
const offPlan = planDelivery(groups, off);
assert(emailsThisRun(offPlan) === 0, 'off yields zero emails');
assert(offPlan.weeklyPending.length === 0, 'off queues nothing for the weekly run either');
assert(offPlan.silent === true, 'off is reported as silent');

// --- Scenario 3: no preferences row -> org defaults ---
const fallback = resolveRecipientPreference(null, orgOn);
const fallbackPlan = planDelivery(groups, fallback);
assert(fallback.fromUserRow === false, 'no row -> defaults were used');
assert(fallback.frequency === 'daily_digest', 'default frequency is daily_digest');
assert(emailsThisRun(fallbackPlan) === 1, 'a user with no row still receives their alerts');
assert(fallbackPlan.dailyDigest.length === 4, 'default routing covers every org-enabled band');

// Org timing narrows the default: an org that never enabled 15 must not send it.
const narrowOrg = resolveRecipientPreference(null, { timing: [30, 1], enabled: true });
const narrowPlan = planDelivery(groups, narrowOrg);
assert(narrowPlan.dailyDigest.length === 2, `org timing still constrains a no-row user (got ${narrowPlan.dailyDigest.length})`);
assert(narrowPlan.skippedByThreshold.length === 2, 'the excluded bands are reported, not lost');

// --- Scenario 4: immediate -> per-band, as before ---
const immediate = resolveRecipientPreference(
  { user_id: 'u3', organization_id: 'o1', vgp_frequency: 'immediate', vgp_thresholds: [30, 15, 7, 1, 0] },
  orgOn);
const immPlan = planDelivery(groups, immediate);
assert(immPlan.immediate.length === 4, `immediate sends one email per band (got ${immPlan.immediate.length})`);
assert(immPlan.dailyDigest.length === 0, 'immediate does not also produce a digest');
assert(emailsThisRun(immPlan) === 4, 'immediate preserves the pre-feature email count');

// --- Scenario 5: weekly_digest defers, sends nothing now ---
const weekly = resolveRecipientPreference(
  { user_id: 'u4', organization_id: 'o1', vgp_frequency: 'weekly_digest', vgp_thresholds: [30, 15, 7, 1, 0] },
  orgOn);
const weeklyPlan = planDelivery(groups, weekly);
assert(emailsThisRun(weeklyPlan) === 0, 'weekly_digest sends no email during the daily run');
assert(weeklyPlan.weeklyPending.length === 4, 'weekly_digest queues every eligible band');

// --- Mixed org: each recipient is routed independently ---
const recipients = [
  { label: 'daily', pref: daily },
  { label: 'off', pref: off },
  { label: 'norow', pref: fallback },
  { label: 'immediate', pref: immediate },
  { label: 'weekly', pref: weekly },
];
const total = recipients.reduce((n, r) => n + emailsThisRun(planDelivery(groups, r.pref)), 0);
assert(total === 1 + 0 + 1 + 4 + 0,
  `a mixed org sends 6 emails across 5 recipients, not 20 (got ${total})`);

done('N4_ROUTING_VERIFIED');
