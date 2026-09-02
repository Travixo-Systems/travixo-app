// G6: the dedup insert must happen BEFORE the send, and zero returned rows
// must short-circuit the send. Verified by source ORDER, not mere presence.
import { read, assert, done } from './_util.mjs';
const src = read('app/api/cron/vgp-alerts/route.ts');

// Locate the VGP digest block (not the recall pass, which has its own insert).
const start = src.indexOf('for (const [level, items] of byUrgency)');
assert(start !== -1, 'located the per-urgency digest loop');
const end = src.indexOf('runClientRecallPass');
const block = src.slice(start, end === -1 ? src.length : end);

const insertAt = block.search(/\.from\(\s*["']vgp_alerts["']\s*\)\s*\n?\s*\.insert/);
const sendAt   = block.search(/await\s+sendVGPAlert\(/);
assert(insertAt !== -1, 'vgp_alerts insert found in the digest block');
assert(sendAt !== -1, 'sendVGPAlert call found in the digest block');
assert(insertAt !== -1 && sendAt !== -1 && insertAt < sendAt,
  'INSERT is ordered BEFORE sendVGPAlert (claim-then-send)');

assert(/onConflict|ON CONFLICT|ignoreDuplicates/i.test(block),
  'insert ignores conflicts rather than throwing');
assert(/ignoreDuplicates:\s*true/.test(block),
  'supabase-js expresses ON CONFLICT DO NOTHING via upsert ignoreDuplicates:true');
assert(/\.select\(\s*["']id["']\s*\)/.test(block), 'insert returns id (RETURNING id)');

// Zero claimed rows must skip the send.
const between = block.slice(insertAt, sendAt);
assert(/length\s*===?\s*0|!\w*[Cc]laimed|length\s*<\s*1/.test(between),
  'a zero-row check sits between the claim and the send');
assert(/continue|return|skip/i.test(between), 'the zero-row branch skips the send');

// The old failure mode must be gone: no post-send insert whose failure is only logged.
assert(!/Failed to log alerts/.test(block) || insertAt < sendAt,
  'no post-send "failed to log" duplicate path remains');
done('FIX2_ORDER_VERIFIED');
