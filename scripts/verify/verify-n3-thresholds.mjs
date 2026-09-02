// N3: threshold filtering against the REAL FREQUENCY_RULES table.
//
// The band -> preferenceDay mapping is the subtle part: the critical band spans
// days 0-6 but identifies as 1, and urgent spans 7-14 but identifies as 7. This
// gate reads the actual rules out of the cron source so it cannot drift from a
// hand-copied duplicate.
import { read, assert, done } from './_util.mjs';
import { loadTs } from './_load-ts.mjs';

const m = await loadTs('lib/vgp/notification-routing.ts');
const { isThresholdEnabled, planDelivery, VGP_THRESHOLDS } = m;

// Parse FREQUENCY_RULES out of the cron.
const src = read('app/api/cron/vgp-alerts/route.ts');
const block = src.slice(src.indexOf('const FREQUENCY_RULES'), src.indexOf('];', src.indexOf('const FREQUENCY_RULES')));
const rules = [...block.matchAll(/level:\s*"(\w+)"[\s\S]*?alertType:\s*"(\w+)",\s*preferenceDay:\s*(-?\d+)/g)]
  .map((mm) => ({ level: mm[1], alertType: mm[2], preferenceDay: Number(mm[3]) }));

assert(rules.length === 5, `parsed all 5 frequency rules (got ${rules.length})`);

const days = rules.map((r) => r.preferenceDay).sort((a, b) => b - a);
assert(JSON.stringify(days) === JSON.stringify([30, 15, 7, 1, 0]),
  `rule preferenceDays are exactly the offered thresholds (got ${JSON.stringify(days)})`);
assert(JSON.stringify([...VGP_THRESHOLDS].sort((a, b) => b - a)) === JSON.stringify(days),
  'VGP_THRESHOLDS matches the cron rules - UI cannot offer a threshold no band uses');

// Overdue must be togglable, not hardcoded on.
const overdue = rules.find((r) => r.alertType === 'overdue');
assert(overdue && overdue.preferenceDay === 0, 'overdue band identifies as threshold 0');
assert(!isThresholdEnabled(0, [30, 15, 7, 1]), 'overdue is skipped when 0 is absent from the array');
assert(isThresholdEnabled(0, [0]), 'overdue is sent when 0 is present');

// Each band is independently controllable.
for (const r of rules) {
  assert(isThresholdEnabled(r.preferenceDay, [r.preferenceDay]),
    `${r.level} enabled when its own day is selected`);
  const others = days.filter((d) => d !== r.preferenceDay);
  assert(!isThresholdEnabled(r.preferenceDay, others),
    `${r.level} skipped when its day is deselected`);
}

// planDelivery drops disabled bands and reports why.
const groups = rules.map((r) => ({
  preferenceDay: r.preferenceDay,
  alertType: r.alertType,
  urgencyLevel: r.level,
  items: [{ id: `${r.level}-1` }],
}));

const only7 = planDelivery(groups, { frequency: 'immediate', thresholds: [7], fromUserRow: true });
assert(only7.immediate.length === 1, `only the 7-band survives (got ${only7.immediate.length})`);
assert(only7.immediate[0].preferenceDay === 7, 'the surviving band is the 7 band');
assert(only7.skippedByThreshold.length === 4, 'the other four are reported as threshold-skipped');
assert(only7.silent === false, 'not silent when one band survives');

const noneEnabled = planDelivery(groups, { frequency: 'immediate', thresholds: [], fromUserRow: true });
assert(noneEnabled.silent === true, 'silent when no band is enabled');
assert(noneEnabled.skippedByThreshold.length === 5, 'all five reported as skipped, not lost');

// Empty groups never produce mail.
const emptyItems = planDelivery(
  [{ preferenceDay: 30, alertType: 'reminder_30day', urgencyLevel: 'planning', items: [] }],
  { frequency: 'immediate', thresholds: [30], fromUserRow: false });
assert(emptyItems.silent === true, 'a band with zero items does not generate an email');

done('N3_THRESHOLDS_VERIFIED');
