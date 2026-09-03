// G10: no NEW eslint errors in the touched files.
//
// The repository does not lint clean at the baseline (20 pre-existing
// no-explicit-any errors across these files). Demanding zero would either fail
// forever or tempt a blanket disable, so this compares against the baseline
// commit instead: it stashes nothing and mutates nothing, it reads the
// baseline copies out of git into a temp dir and lints those.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';

const BASE = readFileSync('.unlazy-baseline', 'utf8').trim();

const FILES = [
  'app/api/cron/vgp-alerts/route.ts',
  'app/api/internal/post-registration/route.ts',
  'app/(dashboard)/dashboard/page.tsx',
  'app/(dashboard)/settings/notifications/page.tsx',
  'app/api/settings/notifications/route.ts',
  'lib/email/email-service.ts',
  'lib/email/templates/components/email-footer.tsx',
  'lib/i18n.ts',
];
const NEW_FILES = [
  'lib/vgp/demo-exclusion.ts',
  'lib/vgp/notification-routing.ts',
  'lib/email/templates/demo-showcase-alert.tsx',
  'lib/email/templates/vgp-digest.tsx',
  'app/api/cron/vgp-weekly-digest/route.ts',
  'app/api/settings/notifications/preferences/route.ts',
  'components/settings/MyVGPAlertPreferences.tsx',
];

function lintJson(paths, cwd) {
  let out = '';
  try {
    out = execFileSync('npx', ['eslint', '-f', 'json', ...paths.map((p) => `"${p}"`)], {
      encoding: 'utf8', stdio: 'pipe', shell: true, timeout: 600000, cwd,
    });
  } catch (e) {
    out = e.stdout || '';
  }
  const start = out.indexOf('[');
  if (start === -1) return null;
  try { return JSON.parse(out.slice(start)); } catch { return null; }
}

/** rule-id fingerprints of severity-2 messages, per file basename. */
function fingerprints(report) {
  const acc = [];
  for (const f of report || []) {
    const name = f.filePath.split(/[\\/]/).slice(-1)[0];
    for (const m of f.messages) if (m.severity === 2) acc.push(`${name} :: ${m.ruleId}`);
  }
  return acc.sort();
}

// Baseline: materialise the pre-work copies into a scratch tree.
//
// The tree must live INSIDE the project. eslint resolves its flat config from
// the file's own directory upward and refuses to lint paths outside the project
// root, so a tmpdir copy silently reports zero problems -- which would make
// every current error look newly introduced.
const scratch = '.unlazy-lint-baseline';
rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });
let baselineOk = true;
for (const f of FILES) {
  let content;
  try {
    content = execFileSync('git', ['show', `${BASE}:${f}`], { encoding: 'utf8', maxBuffer: 33554432 });
  } catch { baselineOk = false; continue; }
  const dest = join(scratch, f);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content, 'utf8');
}

const nowFp = fingerprints(lintJson([...FILES, ...NEW_FILES]));
if (nowFp === null) {
  console.error('FAIL: could not parse eslint output for the working tree');
  process.exit(1);
}

// Lint the baseline copies in place (same eslint config, resolved from cwd).
let baseFp = [];
if (baselineOk) {
  const rel = FILES.map((f) => join(scratch, f).replace(/\\/g, '/'));
  baseFp = fingerprints(lintJson(rel)) || [];
}

const counts = new Map();
for (const k of baseFp) counts.set(k, (counts.get(k) || 0) + 1);
const introduced = [];
for (const k of nowFp) {
  const c = counts.get(k) || 0;
  if (c > 0) counts.set(k, c - 1); else introduced.push(k);
}

console.log(`baseline errors: ${baseFp.length}`);
console.log(`current errors:  ${nowFp.length}`);

if (introduced.length) {
  console.error('FAIL: eslint errors introduced by this work:');
  for (const k of introduced) console.error(`  - ${k}`);
  console.error('\nLINT_CLEAN not emitted.');
  rmSync(scratch, { recursive: true, force: true });
  process.exit(1);
}

console.log('no new eslint errors introduced');
rmSync(scratch, { recursive: true, force: true });
console.log('\nLINT_CLEAN');
