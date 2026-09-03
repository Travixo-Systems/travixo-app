// G11: out-of-scope invariants must be byte-identical to the pre-work baseline.
// Baseline is pinned to the commit this work started from.
const BASE = 'af9bd0db85828b24569ed001293241853f9832d6';
import { read, assert, done, gitShow } from './_util.mjs';

function extract(text, startRe, endRe, label) {
  const s = text.search(startRe);
  if (s === -1) return null;
  const rest = text.slice(s);
  const e = rest.search(endRe);
  return e === -1 ? rest : rest.slice(0, e);
}

// 1. Subject lines unchanged.
const svcNow  = read('lib/email/email-service.ts');
const svcBase = gitShow(BASE, 'lib/email/email-service.ts');
assert(svcBase !== null, 'baseline email-service.ts retrievable');
const subjRe = /const SUBJECT_LINES/;
const subjEnd = /\n\/\/ ---/;
const sNow  = extract(svcNow, subjRe, subjEnd);
const sBase = extract(svcBase, subjRe, subjEnd);
assert(sNow !== null && sBase !== null, 'SUBJECT_LINES block located in both');
assert(sNow === sBase, 'SUBJECT_LINES is byte-identical to baseline');

// 2. FREQUENCY_RULES unchanged.
const cronNow  = read('app/api/cron/vgp-alerts/route.ts');
const cronBase = gitShow(BASE, 'app/api/cron/vgp-alerts/route.ts');
const frRe = /const FREQUENCY_RULES/;
const frEnd = /\];/;
const fNow  = extract(cronNow, frRe, frEnd);
const fBase = extract(cronBase, frRe, frEnd);
assert(fNow !== null && fBase !== null, 'FREQUENCY_RULES located in both');
assert(fNow === fBase, 'FREQUENCY_RULES is byte-identical to baseline');

// 3. Notification-preference reading unchanged.
const npRe = /async function getOrgNotificationPrefs/;
const npEnd = /\n\/\/ =====/;
const nNow  = extract(cronNow, npRe, npEnd);
const nBase = extract(cronBase, npRe, npEnd);
assert(nNow === nBase, 'getOrgNotificationPrefs is byte-identical to baseline');

// 4. The seeded overdue Toyota must be preserved exactly.
const seedNow  = read('lib/seed/demo-data.ts');
const seedBase = gitShow(BASE, 'lib/seed/demo-data.ts');
assert(seedNow === seedBase, 'lib/seed/demo-data.ts is byte-identical to baseline (Toyota preserved)');
assert(/overdueDate\.setDate\(overdueDate\.getDate\(\) - 10\)/.test(seedNow),
  'seeded Toyota is still born 10 days overdue');

// 5. No new npm dependencies.
const pkgNow  = JSON.parse(read('package.json'));
const pkgBase = JSON.parse(gitShow(BASE, 'package.json'));
assert(JSON.stringify(pkgNow.dependencies) === JSON.stringify(pkgBase.dependencies),
  'no new runtime dependencies');
assert(JSON.stringify(pkgNow.devDependencies) === JSON.stringify(pkgBase.devDependencies),
  'no new dev dependencies');
done('SCOPE_RESPECTED');
