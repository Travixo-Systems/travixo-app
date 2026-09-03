// G4: showcase email — exact copy from the spec, atomic one-shot guard, migration.
import { readdirSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';

const svc = read('lib/email/email-service.ts');
const route = read('app/api/internal/post-registration/route.ts');

// Exact strings required by the spec.
assert(svc.includes("[TraviXO Démo] Exemple d'alerte VGP - "),
  'subject prefix "[TraviXO Démo] Exemple d\'alerte VGP - " exact');
assert(/sendDemoShowcaseAlert/.test(svc), 'sendDemoShowcaseAlert exported from email-service');
assert(/organizationName/.test(svc), 'subject interpolates the org name');

// Render the real template to HTML and assert on the DELIVERED text. Source
// matching would be fooled by JSX line wrapping and &apos; escaping - and would
// also pass on text that never actually reaches the recipient.
const tpl = read('lib/email/templates/demo-showcase-alert.tsx');
const { renderShowcase } = await import('./_render-showcase.mjs');
const rendered = await renderShowcase();

const NBSP = String.fromCharCode(0x00a0);
const plain = rendered
  .replace(/<[^>]+>/g, ' ')
  .replace(/&apos;|&#x27;|&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ')
  .split(NBSP).join(' ')
  .replace(/\s+/g, ' ')
  .trim();

// Control: the normalizer must not be silently destroying content. If this
// fails, every assertion below is meaningless regardless of the template.
assert(plain.length > 400, `normalizer preserved the body (${plain.length} chars)`);
assert(plain.includes('TraviXO'), 'normalizer control: brand name survives normalization');

assert(plain.includes("Voici un exemple du type d'alerte que TraviXO enverra pour votre parc."),
  'demo framing sentence exact IN RENDERED OUTPUT');
assert(plain.includes('Cet email est un exemple. Les vraies alertes commenceront quand vous importerez votre parc.'),
  'footer disclaimer exact IN RENDERED OUTPUT');

// Specimen must show the four required facts, in the DELIVERED output.
assert(plain.includes('Chariot elevateur Toyota 8FD25'), 'specimen shows asset name');
assert(plain.includes('CHA-2021-0103'), 'specimen shows serial number');
assert(/10 jours/.test(plain), 'specimen shows days overdue');
assert(/Action attendue/.test(plain), 'specimen shows required action');

// It must NOT masquerade as a real compliance alert.
assert(!/EN RETARD/.test(plain), 'does not reuse the real overdue urgency badge');
assert(!/L4741-1/.test(plain), 'does not cite criminal penalties like a real alert');
assert(/EXEMPLE/.test(plain), 'carries an explicit EXEMPLE badge');

// Template still declares the specimen fields it is given.
assert(/daysOverdue/.test(tpl), 'template consumes daysOverdue');
assert(/actionRequired/.test(tpl), 'template consumes actionRequired');

// One send, never repeated: atomic conditional UPDATE guard.
//
// The claim goes through the shared claimOneShotEmail() helper, whose
// atomicity is proven by execution in verify-fix3-guard.mjs (single
// conditional UPDATE, no preceding SELECT, both negative controls). This gate
// asserts the showcase path actually routes through that helper and that the
// send is gated on winning.
assert(/demo_alert_sent/.test(route), 'route references demo_alert_sent');
assert(/claimOneShotEmail\(\s*orgId,\s*'demo_alert_sent'\s*\)/.test(route),
  'showcase send is gated by the shared atomic claim helper');

const showcaseFn = route.match(/async function sendDemoShowcaseAlertOnce\([\s\S]*?\n\}/);
assert(showcaseFn !== null, 'sendDemoShowcaseAlertOnce located');
const fnBody = showcaseFn ? showcaseFn[0] : '';
const guardAt = fnBody.search(/claimOneShotEmail/);
const sendCallAt = fnBody.search(/await sendDemoShowcaseAlert\(/);
assert(guardAt !== -1 && sendCallAt !== -1 && guardAt < sendCallAt,
  'the claim is taken BEFORE the showcase send');
assert(/if\s*\(\s*!\s*\(await claimOneShotEmail/.test(fnBody),
  'losing the claim returns early without sending');

// Migration adds the column.
const migs = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const demoMig = migs.filter((f) => {
  const t = read(`supabase/migrations/${f}`);
  return /demo_alert_sent/.test(t) && /ALTER TABLE/i.test(t);
});
assert(demoMig.length >= 1, `a migration adds demo_alert_sent (found: ${demoMig.join(', ') || 'none'})`);
if (demoMig.length) {
  const t = read(`supabase/migrations/${demoMig[0]}`);
  assert(/IF NOT EXISTS/i.test(t), 'column add is idempotent (IF NOT EXISTS)');
  assert(/DEFAULT\s+false/i.test(t), 'column defaults to false');
  assert(/^\d{14}_/.test(demoMig[0]), `migration has a timestamp prefix (${demoMig[0]})`);
}
done('FIX1_SHOWCASE_VERIFIED');
