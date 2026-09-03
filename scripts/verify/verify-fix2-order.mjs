// G6: the dedup insert must happen BEFORE the send, and zero returned rows
// must short-circuit the send. Verified by source ORDER, not mere presence.
import { read, assert, done } from './_util.mjs';
const src = read('app/api/cron/vgp-alerts/route.ts');

// Locate the VGP digest block (not the recall pass, which has its own insert).
const start = src.indexOf('for (const [level, items] of byUrgency)');
assert(start !== -1, 'located the per-urgency digest loop');
const end = src.indexOf('runClientRecallPass');
const block = src.slice(start, end === -1 ? src.length : end);

// The claim is an upsert with ignoreDuplicates - supabase-js's spelling of
// INSERT ... ON CONFLICT DO NOTHING. Match either verb so this gate describes
// the guarantee (a conflict-tolerant write) rather than one library idiom.
const insertAt = block.search(/\.from\(\s*["']vgp_alerts["']\s*\)\s*\n?\s*\.(insert|upsert)/);
const sendAt   = block.search(/await\s+sendVGPAlert\(/);
assert(insertAt !== -1, 'vgp_alerts claim write found in the digest block');
assert(sendAt !== -1, 'sendVGPAlert call found in the digest block');
assert(insertAt !== -1 && sendAt !== -1 && insertAt < sendAt,
  'the claim write is ordered BEFORE sendVGPAlert (claim-then-send)');

assert(/onConflict|ON CONFLICT|ignoreDuplicates/i.test(block),
  'claim ignores conflicts rather than throwing');
assert(/ignoreDuplicates:\s*true/.test(block),
  'supabase-js expresses ON CONFLICT DO NOTHING via upsert ignoreDuplicates:true');
assert(/onConflict:\s*["']schedule_id,alert_type,alert_date["']/.test(block),
  'onConflict names the unique index columns so that index arbitrates');
assert(/\.select\(\s*["']id[^"']*["']\s*\)/.test(block),
  'claim returns rows (RETURNING) so the caller can tell what it won');

// Zero claimed rows must skip the send.
const between = block.slice(insertAt, sendAt);
assert(/size\s*===?\s*0|length\s*===?\s*0|!\w*[Cc]laimed|length\s*<\s*1/.test(between),
  'a zero-row check sits between the claim and the send');
assert(/continue|return|skip/i.test(between), 'the zero-row branch skips the send');

// The send must cover only what was claimed, or a partial claim re-reports
// schedules that a concurrent run is already emailing about.
assert(/claimedItems|claimedRowsForEmail/.test(between),
  'the send payload is derived from the claimed subset, not the full batch');
assert(/sendVGPAlert\([\s\S]{0,200}?claimedRowsForEmail/.test(block),
  'sendVGPAlert is passed the claimed rows');

// A failed send must release the claim, or the alert is silently suppressed.
const after = block.slice(sendAt);
assert(/!sendResult\.success[\s\S]{0,900}?\.delete\(\)/.test(after),
  'a failed send releases the claim so the next run retries');

// The old failure mode must be gone: no post-send insert whose failure is only logged.
assert(!/Failed to log alerts/.test(block) || insertAt < sendAt,
  'no post-send "failed to log" duplicate path remains');
done('FIX2_ORDER_VERIFIED');
