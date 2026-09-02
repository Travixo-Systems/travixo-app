import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assert, done } from './_util.mjs';
const BASE = readFileSync('.unlazy-baseline', 'utf8').trim();
const log = execFileSync('git', ['log', '--format=%s', `${BASE}..HEAD`], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).reverse();
assert(log.length >= 1, `at least one commit since baseline (got ${log.length})`);
for (const s of log) {
  assert(/^(feat|fix|chore|refactor|docs)(\([\w-]+\))?: .{10,}/.test(s), `conventional subject: "${s}"`);
}
const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
assert(status === '', `working tree clean (uncommitted: ${JSON.stringify(status)})`);
done('COMMITS_VERIFIED');
