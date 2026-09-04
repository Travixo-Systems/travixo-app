// R4: the route calls the RPC and no upsert against vgp_alerts remains.
import { read, assert, done } from './_util.mjs';
const src = read('app/api/cron/vgp-alerts/route.ts');

const loop = src.indexOf('for (const [level, items] of byUrgency)');
assert(loop !== -1, 'digest loop located');
const block = src.slice(loop, src.indexOf('runClientRecallPass'));

assert(/\.rpc\(\s*"claim_vgp_alerts"/.test(block), 'the claim goes through the RPC');
assert(!/\.from\("vgp_alerts"\)\s*\n?\s*\.upsert/.test(block),
  'no upsert against vgp_alerts remains - that form cannot name a partial index');
assert(!/onConflict:\s*"schedule_id,alert_type,alert_date"/.test(src),
  'the broken onConflict string is gone from the whole file');

// Claim still precedes the send.
const claimAt = block.search(/\.rpc\(\s*"claim_vgp_alerts"/);
const deliverAt = src.search(/await deliverToRecipients\(/);
assert(claimAt !== -1 && deliverAt !== -1 && loop < deliverAt, 'delivery still runs after the claim loop');
assert(/claimedGroups\.push\(/.test(block), 'only claimed items reach delivery');

// The out_* names are consumed.
assert(/out_schedule_id/.test(block), 'reads out_schedule_id');
assert(/out_id/.test(block), 'reads out_id');
assert(!/\(r\)\s*=>\s*r\.schedule_id\)/.test(block), 'no stale r.schedule_id read');
done('R4_ROUTE_VERIFIED');
