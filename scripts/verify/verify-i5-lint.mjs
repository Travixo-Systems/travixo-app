// I5b: the rewritten route introduces no NEW lint problems.
//
// The file is not lint-clean at baseline (3 errors, 2 warnings), and fixing
// pre-existing issues is not this change's job. So the oracle compares counts
// against the baseline commit rather than demanding zero -- and fails if this
// change adds any.
//
// eslint's exit code is read directly. Piping it into another process (tail,
// node) returns the PIPELINE's status, which is 0 even when eslint reports
// errors -- that is how 4 errors first looked like a pass here.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, done, gitShow } from './_util.mjs';

const ROUTE = 'app/api/vgp/inspections/route.ts';
const BASE = readFileSync('.unlazy-baseline', 'utf8').trim();

function lintCounts(file) {
  let out;
  try {
    out = execFileSync('npx', ['eslint', file, '--format', 'json'],
      { encoding: 'utf8', stdio: 'pipe', shell: true, timeout: 300000 });
  } catch (e) {
    out = e.stdout || '';           // eslint exits 1 when it reports errors
  }
  const start = out.indexOf('[');
  assert(start !== -1, `eslint returned parseable JSON for ${file}`);
  const r = JSON.parse(out.slice(start));
  const f = r.find((x) => x.filePath.replace(/\\/g, '/').endsWith(file.replace(/\\/g, '/').split('/').pop()));
  return { errors: f.errorCount, warnings: f.warningCount };
}

const now = lintCounts(ROUTE);

// Lint the baseline copy of the same file, written beside it so the same
// eslint config and tsconfig project apply.
const tmp = mkdtempSync(join(tmpdir(), 'i5lint-'));
const baseCopy = join('app', 'api', 'vgp', 'inspections', '__baseline_route.ts');
let base;
try {
  writeFileSync(baseCopy, gitShow(BASE, ROUTE));
  base = lintCounts(baseCopy);
} finally {
  try { rmSync(baseCopy); } catch { /* already gone */ }
  try { rmSync(tmp, { recursive: true }); } catch { /* already gone */ }
}

console.log(`  baseline: ${base.errors} errors, ${base.warnings} warnings`);
console.log(`  current:  ${now.errors} errors, ${now.warnings} warnings`);

assert(now.errors <= base.errors,
  `no new lint ERRORS (baseline ${base.errors}, now ${now.errors})`);
assert(now.warnings <= base.warnings,
  `no new lint warnings (baseline ${base.warnings}, now ${now.warnings})`);

done('I5_LINT_NO_REGRESSION');
