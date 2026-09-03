const BASE = 'af9bd0db85828b24569ed001293241853f9832d6';
import { execFileSync } from 'node:child_process';
import { assert, done } from './_util.mjs';

const log = execFileSync('git', ['log', '--format=%s', `${BASE}..HEAD`], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).reverse();

const want = [
  'fix: exclude demo assets from VGP alert cron, add showcase email',
  'fix: add unique dedup index to vgp_alerts, insert-before-send',
  'fix: welcome email idempotency guard, single caller',
];
assert(log.length === 3, `exactly 3 commits since baseline (got ${log.length}: ${JSON.stringify(log)})`);
want.forEach((w, i) => assert(log[i] === w, `commit ${i + 1} subject exact: "${w}"`));

// Working tree must be clean - no uncommitted remainder.
const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
assert(status === '', `working tree clean (uncommitted: ${JSON.stringify(status)})`);
done('COMMITS_VERIFIED');
