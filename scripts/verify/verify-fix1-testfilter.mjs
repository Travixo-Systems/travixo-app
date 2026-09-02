// G3: .test recipients suppressed, count logged. Uses the shared predicate so
// the same rule is provable in isolation.
import { read, assert, done } from './_util.mjs';
import { loadTs } from './_load-ts.mjs';
const src = read('app/api/cron/vgp-alerts/route.ts');

assert(/getAlertRecipients/.test(src), 'getAlertRecipients present');
assert(/isUndeliverableEmail|\.test["'`]/.test(src), 'a .test suppression rule exists');
assert(/filtered|suppress/i.test(src), 'suppression is named in code or logs');

const mod = await loadTs('lib/vgp/demo-exclusion.ts');
assert(typeof mod.isUndeliverableEmail === 'function', 'isUndeliverableEmail exported');
const { isUndeliverableEmail } = mod;

const cases = [
  ['user0@acme-plant.test', true,  'seeded .test address suppressed (positive control)'],
  ['USER0@ACME.TEST',       true,  'uppercase .TEST suppressed'],
  ['  a@b.test  ',          true,  'whitespace-padded .test suppressed'],
  ['owner@travixo.com',     false, 'real .com kept'],
  ['a@b.testing.fr',        false, '.testing.fr is NOT .test (no false positive)'],
  ['a@testbed.fr',          false, 'testbed.fr kept'],
  ['contact@my.test.fr',    false, 'mid-label "test" kept'],
  ['',                      true,  'empty address suppressed'],
  [null,                    true,  'null address suppressed'],
];
for (const [addr, want, label] of cases) {
  assert(isUndeliverableEmail(addr) === want, `${label} (${JSON.stringify(addr)})`);
}
done('FIX1_TESTFILTER_VERIFIED');
