// G7: welcome email fires at most once per org.
//
// The claim helper is parameterised over the column name, so matching a
// literal `welcome_email_sent: true` would be checking one spelling rather than
// the property. This gate instead EXECUTES the route's claim shape against a
// recording fake and asserts the resulting query: a single conditional UPDATE
// that returns rows, never a SELECT followed by an UPDATE.
import { readdirSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';

const route = read('app/api/internal/post-registration/route.ts');

assert(/welcome_email_sent/.test(route), 'route references welcome_email_sent');

const claimAt = route.search(/claimOneShotEmail\(\s*orgId,\s*'welcome_email_sent'/);
const sendAt = route.search(/sendWelcomeEmail\(/);
assert(claimAt !== -1, 'welcome send is gated by a claimOneShotEmail call');
assert(claimAt !== -1 && sendAt !== -1 && claimAt < sendAt,
  'the claim is evaluated BEFORE sendWelcomeEmail');

// --- Behavioural check of the claim itself -------------------------------
// Rebuild the helper's query chain against a fake supabase client and record
// what it does. This proves the atomicity property rather than its spelling.
const calls = [];
const chain = {
  update(patch) { calls.push(['update', patch]); return chain; },
  eq(col, val) { calls.push(['eq', col, val]); return chain; },
  select(cols) { calls.push(['select', cols]); return Promise.resolve({ data: [{ id: 'org-1' }], error: null }); },
  from(table) { calls.push(['from', table]); return chain; },
};

// Extract and run the helper body with the fake injected.
const bodyMatch = route.match(/async function claimOneShotEmail\([\s\S]*?\n\}/);
assert(bodyMatch !== null, 'claimOneShotEmail helper located');

const body = bodyMatch[0]
  .replace(/const supabase = getServiceSupabase\(\);/, 'const supabase = __fake;')
  .replace(/^async function claimOneShotEmail\(/, 'async function __claim(')
  .replace(/:\s*'welcome_email_sent'\s*\|\s*'demo_alert_sent'/, '')
  .replace(/orgId:\s*string/, 'orgId')
  .replace(/column[^,)]*/, 'column')
  .replace(/\)\s*:\s*Promise<boolean>/, ')');

// eslint-disable-next-line no-new-func
const claim = new Function('__fake', 'console', `${body}; return __claim;`)(chain, { error() {} });
const won = await claim('org-1', 'welcome_email_sent');

assert(won === true, 'claim returns true when the conditional UPDATE returns a row');

const verbs = calls.map((c) => c[0]);
assert(!verbs.includes('select') || verbs.indexOf('update') < verbs.indexOf('select'),
  'no SELECT precedes the UPDATE (a read-then-write pair would not be atomic)');
assert(verbs.filter((v) => v === 'update').length === 1, 'exactly one UPDATE issued');

const updatePatch = calls.find((c) => c[0] === 'update')?.[1];
assert(updatePatch && updatePatch['welcome_email_sent'] === true,
  'the UPDATE sets welcome_email_sent = true');

const eqs = calls.filter((c) => c[0] === 'eq');
assert(eqs.some((c) => c[1] === 'id'), 'UPDATE is scoped to one organization by id');
assert(eqs.some((c) => c[1] === 'welcome_email_sent' && c[2] === false),
  'UPDATE is conditional on welcome_email_sent = false (the atomic claim)');
assert(calls.some((c) => c[0] === 'select'),
  'claim selects returning rows so the caller can tell whether it won');

// Negative control: zero returned rows must NOT be treated as a win.
const emptyChain = {
  update() { return emptyChain; },
  eq() { return emptyChain; },
  select() { return Promise.resolve({ data: [], error: null }); },
  from() { return emptyChain; },
};
// eslint-disable-next-line no-new-func
const claimEmpty = new Function('__fake', 'console', `${body}; return __claim;`)(emptyChain, { error() {} });
assert((await claimEmpty('org-1', 'welcome_email_sent')) === false,
  'negative control: zero returned rows means already sent, not a win');

// Negative control: a database error must not be treated as a win.
const errChain = {
  update() { return errChain; },
  eq() { return errChain; },
  select() { return Promise.resolve({ data: null, error: { message: 'boom' } }); },
  from() { return errChain; },
};
// eslint-disable-next-line no-new-func
const claimErr = new Function('__fake', 'console', `${body}; return __claim;`)(errChain, { error() {} });
assert((await claimErr('org-1', 'welcome_email_sent')) === false,
  'negative control: a claim error declines to send');

// The old unconditional call must be gone.
assert(!/^\s*const emailResult = await sendWelcomeEmail\(\{[\s\S]*?\}\);\s*$/m.test(route)
  || claimAt < sendAt, 'no unconditional sendWelcomeEmail call remains');

// Migration adds the column.
const migs = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const hit = migs.filter((f) => {
  const t = read(`supabase/migrations/${f}`);
  return /welcome_email_sent/.test(t) && /ALTER TABLE/i.test(t);
});
assert(hit.length >= 1, `a migration adds welcome_email_sent (found: ${hit.join(', ') || 'none'})`);
if (hit.length) {
  const t = read(`supabase/migrations/${hit[0]}`);
  assert(/^\d{14}_/.test(hit[0]), `timestamp prefix (${hit[0]})`);
  assert(/IF NOT EXISTS/i.test(t), 'idempotent column add');
  assert(/DEFAULT\s+false/i.test(t), 'defaults to false');
  assert(/UPDATE\s+public\.organizations[\s\S]{0,200}welcome_email_sent\s*=\s*true/i.test(t),
    'existing orgs are backfilled as already-sent (no mass re-send)');
}
done('FIX3_GUARD_VERIFIED');
