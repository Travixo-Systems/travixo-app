// R5: claim-release-on-failure preserved.
import { read, assert, done } from './_util.mjs';
const src = read('app/api/cron/vgp-alerts/route.ts');

assert(/allClaimedRowIds/.test(src), 'claimed row ids are still tracked');
assert(/allClaimedRowIds\.push\(\.\.\.\(claimedRows \|\| \[\]\)\.map\(\(r\) => r\.out_id\)\)/.test(src),
  'ids come from out_id, matching the RPC return');

const rel = src.slice(src.indexOf('if (!anyoneReceivedSomething'));
assert(/\.from\("vgp_alerts"\)/.test(rel), 'release still targets vgp_alerts');
assert(/\.delete\(\)/.test(rel), 'release deletes');
assert(/\.in\("id", params\.allClaimedRowIds\)/.test(rel), 'release deletes by the claimed ids');
assert(/outcome\.errors\.length > 0/.test(rel),
  'release only fires when deliveries FAILED, not when recipients declined');
assert(/Sentry\.captureException\(releaseError/.test(rel), 'a failed release is reported');
done('R5_RELEASE_VERIFIED');
