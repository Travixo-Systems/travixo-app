// N2: preference resolution. Executes the real module against fixtures.
import { assert, done } from './_util.mjs';
import { loadTs } from './_load-ts.mjs';

const m = await loadTs('lib/vgp/notification-routing.ts');
const { resolveRecipientPreference } = m;

const orgOn = { timing: [30, 15, 7, 1], enabled: true };
const orgOff = { timing: [30, 15, 7, 1], enabled: false };

// --- absent row falls back to org defaults ---
const noRow = resolveRecipientPreference(null, orgOn);
assert(noRow.frequency === 'daily_digest', `no row -> default frequency (got ${noRow.frequency})`);
assert(JSON.stringify(noRow.thresholds) === JSON.stringify([30, 15, 7, 1]),
  `no row -> org timing as thresholds (got ${JSON.stringify(noRow.thresholds)})`);
assert(noRow.fromUserRow === false, 'no row -> fromUserRow false');
assert(resolveRecipientPreference(undefined, orgOn).frequency === 'daily_digest',
  'undefined row behaves as absent');

// --- user row wins over org defaults ---
const row = {
  user_id: 'u1', organization_id: 'o1',
  vgp_frequency: 'weekly_digest', vgp_thresholds: [7, 1],
};
const resolved = resolveRecipientPreference(row, orgOn);
assert(resolved.frequency === 'weekly_digest', 'user frequency overrides default');
assert(JSON.stringify(resolved.thresholds) === JSON.stringify([7, 1]),
  `user thresholds override org timing (got ${JSON.stringify(resolved.thresholds)})`);
assert(resolved.fromUserRow === true, 'fromUserRow true when a row was used');

// --- every valid frequency round-trips ---
for (const f of ['immediate', 'daily_digest', 'weekly_digest', 'off']) {
  const r = resolveRecipientPreference(
    { user_id: 'u', organization_id: 'o', vgp_frequency: f, vgp_thresholds: [30] }, orgOn);
  assert(r.frequency === f, `frequency "${f}" preserved`);
}

// --- invalid values fall back rather than throw ---
const bogus = resolveRecipientPreference(
  { user_id: 'u', organization_id: 'o', vgp_frequency: 'hourly', vgp_thresholds: [30] }, orgOn);
assert(bogus.frequency === 'daily_digest', 'unknown frequency falls back to default');

const nullFreq = resolveRecipientPreference(
  { user_id: 'u', organization_id: 'o', vgp_frequency: null, vgp_thresholds: [30] }, orgOn);
assert(nullFreq.frequency === 'daily_digest', 'null frequency falls back to default');

// Per-FIELD precedence: a valid frequency survives a corrupt threshold array.
const mixed = resolveRecipientPreference(
  { user_id: 'u', organization_id: 'o', vgp_frequency: 'immediate', vgp_thresholds: null }, orgOn);
assert(mixed.frequency === 'immediate', 'valid frequency kept when thresholds are corrupt');
assert(JSON.stringify(mixed.thresholds) === JSON.stringify([30, 15, 7, 1]),
  'corrupt thresholds fall back to org timing, not to nothing');

const junk = resolveRecipientPreference(
  { user_id: 'u', organization_id: 'o', vgp_frequency: 'immediate', vgp_thresholds: [99, 'x', 7] }, orgOn);
assert(JSON.stringify(junk.thresholds) === JSON.stringify([7]),
  `unknown threshold values dropped, known kept (got ${JSON.stringify(junk.thresholds)})`);

const emptied = resolveRecipientPreference(
  { user_id: 'u', organization_id: 'o', vgp_frequency: 'immediate', vgp_thresholds: [] }, orgOn);
assert(JSON.stringify(emptied.thresholds) === JSON.stringify([30, 15, 7, 1]),
  'an array that normalises to empty is treated as absent, not as silence');

// --- org kill switch wins over any user preference ---
const killed = resolveRecipientPreference(
  { user_id: 'u', organization_id: 'o', vgp_frequency: 'immediate', vgp_thresholds: [30, 0] }, orgOff);
assert(killed.frequency === 'off', 'org enabled=false forces off regardless of user row');
assert(killed.thresholds.length === 0, 'org enabled=false yields no thresholds');

// --- org timing itself is normalised ---
const weirdOrg = resolveRecipientPreference(null, { timing: [999], enabled: true });
assert(JSON.stringify(weirdOrg.thresholds) === JSON.stringify([30, 15, 7, 1, 0]),
  'unusable org timing falls back to the full default set');

done('N2_RESOLUTION_VERIFIED');
