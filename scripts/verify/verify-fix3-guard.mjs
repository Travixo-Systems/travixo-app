// G7: welcome email idempotency via atomic conditional UPDATE ... RETURNING.
import { readdirSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';
const route = read('app/api/internal/post-registration/route.ts');

assert(/welcome_email_sent/.test(route), 'route references welcome_email_sent');
const claimAt = route.search(/welcome_email_sent/);
const sendAt  = route.search(/sendWelcomeEmail\(/);
assert(claimAt !== -1 && sendAt !== -1 && claimAt < sendAt,
  'the guard is evaluated BEFORE sendWelcomeEmail');
assert(/\.update\(\s*\{\s*welcome_email_sent:\s*true/.test(route),
  'guard sets welcome_email_sent = true via UPDATE');
assert(/\.eq\(\s*['"]welcome_email_sent['"]\s*,\s*false\s*\)/.test(route),
  'UPDATE is conditional on welcome_email_sent = false (atomic claim)');
assert(/welcome_email_sent[\s\S]{0,400}?\.select\(/.test(route),
  'claim uses .select() so an empty result means "already sent"');
// The unconditional call must be gone.
const uncond = /const\s+emailResult\s*=\s*await\s+sendWelcomeEmail\(\s*\{[\s\S]{0,200}?\}\s*\);/.test(route)
  && !/welcome_email_sent/.test(route.slice(0, sendAt));
assert(!uncond, 'no unconditional sendWelcomeEmail call remains');

const migs = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const hit = migs.filter((f) => /welcome_email_sent/.test(read(`supabase/migrations/${f}`)) && /ALTER TABLE/i.test(read(`supabase/migrations/${f}`)));
assert(hit.length >= 1, `a migration adds welcome_email_sent (found: ${hit.join(', ') || 'none'})`);
if (hit.length) {
  const t = read(`supabase/migrations/${hit[0]}`);
  assert(/^\d{14}_/.test(hit[0]), `timestamp prefix (${hit[0]})`);
  assert(/IF NOT EXISTS/i.test(t), 'idempotent column add');
  assert(/DEFAULT\s+false/i.test(t), 'defaults to false');
}
done('FIX3_GUARD_VERIFIED');
