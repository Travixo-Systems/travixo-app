// N9: PATCH /api/settings/notifications/preferences
import { existsSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';

const P = 'app/api/settings/notifications/preferences/route.ts';
assert(existsSync(P), 'preferences route exists at the specified path');
const raw = read(P);

// Strip comments before any ABSENCE assertion: the file explains why it omits
// the org-level write gate, and that prose would otherwise satisfy a naive
// "the gate is not present" check.
const r = raw
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');

assert(/export async function PATCH/.test(r), 'exports PATCH');
assert(/export async function GET/.test(r), 'exports GET so the UI can show current values');
assert(/auth\.getUser\(\)/.test(r), 'authenticates the caller');
assert(/Unauthorized/.test(r), 'rejects unauthenticated callers');

// Identity must come from the session, never the request body.
assert(/user_id:\s*caller\.userId/.test(r), 'user_id comes from the session');
assert(/organization_id:\s*caller\.organizationId/.test(r), 'organization_id comes from the session');
assert(!/body[\s\S]{0,40}\buser_id\b/.test(r), 'user_id is never read from the request body');

// Validation rejects rather than coerces.
assert(/VGP_FREQUENCIES/.test(r), 'validates frequency against the shared list');
assert(/VGP_THRESHOLDS/.test(r), 'validates thresholds against the shared list');
assert(/status:\s*400/.test(r), 'invalid input returns 400');
assert(/onConflict:\s*'user_id,organization_id'/.test(r), 'upsert targets the UNIQUE constraint');

// This route must NOT carry the org-level gates: it is every member's own
// setting, and gating it would leave members unable to opt out of mail.
assert(!/\['owner',\s*'admin'\]\.includes/.test(r), 'no owner/admin role gate on a per-user setting');
assert(!/requireWriteAccess\s*\(/.test(r),
  'no pilot write-gate call: freezing opt-out would make an expired trial mean unstoppable mail');

// The org-level route keeps both gates, by contrast.
const org = read('app/api/settings/notifications/route.ts');
assert(/\['owner',\s*'admin'\]\.includes/.test(org), 'org-level route keeps its role gate');
assert(/requireWriteAccess\s*\(/.test(org), 'org-level route keeps its write gate');

done('N9_API_VERIFIED');
