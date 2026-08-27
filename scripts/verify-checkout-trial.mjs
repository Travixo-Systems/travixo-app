#!/usr/bin/env node
/**
 * verify-checkout-trial.mjs
 *
 * Asserts the checkout route actually applies the service term, and — the part
 * that matters — that Stripe accepts the resulting session shape for
 * Professional annual while monthly stays a plain subscription.
 *
 * The unit test in verify-service-term proves the numbers. This proves the
 * wiring: that the route reads the shared helper rather than a local constant,
 * and that a real Stripe API call with these parameters is valid.
 *
 * Stripe calls run against the LOCAL key from .env.local (test mode), and
 * every session created is expired immediately afterwards.
 *
 * Prints "checkout trial verification passed" only when all assertions hold.
 */

import { readFileSync, existsSync } from 'fs'

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 300)}`)
}

// --- 1. the route is wired to the shared helper ------------------
const routePath = 'app/api/stripe/checkout/route.ts'
if (!existsSync(routePath)) {
  console.log(`FAIL  ${routePath} not found`)
  process.exit(1)
}
const route = readFileSync(routePath, 'utf8')

if (/from ['"]@\/lib\/billing\/service-term['"]/.test(route)) {
  pass('checkout route imports the shared service-term module')
} else {
  fail('checkout route does not import lib/billing/service-term')
}

if (/trial_period_days/.test(route)) {
  pass('checkout route sets trial_period_days')
} else {
  fail('checkout route never sets trial_period_days -- the term is not applied')
}

// A hardcoded 90 would drift from the module the way 30-vs-15 did.
if (/trial_period_days:\s*90\b/.test(route)) {
  fail('checkout route hardcodes trial_period_days: 90 instead of deriving it')
} else {
  pass('trial_period_days is derived, not hardcoded')
}

// Spreading undefined must omit the key; an unconditional key would send 0.
if (/\.\.\.\(\s*trialDays\s*\?/.test(route)) {
  pass('trial_period_days is omitted (not zero) when there is no bonus')
} else {
  fail('trial_period_days is not conditionally spread -- risks sending 0, which Stripe rejects')
}

// --- 2. Stripe accepts the real session shape --------------------
const env = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
} catch { /* handled below */ }

const KEY = env.STRIPE_SECRET_KEY
const PRO_ANNUAL = env.STRIPE_PRICE_PROFESSIONAL_ANNUAL
const PRO_MONTHLY = env.STRIPE_PRICE_PROFESSIONAL_MONTHLY

if (!KEY || !KEY.startsWith('sk_test_')) {
  fail('no local sk_test_ key available -- cannot validate the session shape against Stripe')
} else if (!PRO_ANNUAL || !PRO_MONTHLY) {
  fail('local Professional price ids missing from .env.local')
} else {
  const h = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }

  async function createSession({ price, trialDays }) {
    const b = new URLSearchParams()
    b.append('mode', 'subscription')
    b.append('line_items[0][price]', price)
    b.append('line_items[0][quantity]', '1')
    b.append('success_url', 'https://app.travixosystems.com/ok')
    b.append('cancel_url', 'https://app.travixosystems.com/no')
    b.append('subscription_data[metadata][organization_id]', 'verify-probe')
    // Compare against undefined, not truthiness: the control case sends 0 on
    // purpose, and `if (trialDays)` would silently drop it.
    if (trialDays !== undefined) {
      b.append('subscription_data[trial_period_days]', String(trialDays))
    }
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: h, body: b })
    return { status: r.status, body: await r.json() }
  }

  async function expire(id) {
    if (!id) return
    await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}/expire`, {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` },
    }).catch(() => {})
  }

  // Professional ANNUAL with the 90-day trial
  const annual = await createSession({ price: PRO_ANNUAL, trialDays: 90 })
  if (annual.status === 200) {
    pass('Stripe accepts Professional annual with a 90-day trial (15 months of service)')
  } else {
    fail(`Stripe rejected the Professional annual session (${annual.status})`, annual.body?.error?.message)
  }
  await expire(annual.body?.id)

  // Professional MONTHLY must carry no trial
  const monthly = await createSession({ price: PRO_MONTHLY, trialDays: undefined })
  if (monthly.status === 200) {
    pass('Stripe accepts Professional monthly with no trial (unchanged)')
  } else {
    fail(`Stripe rejected the Professional monthly session (${monthly.status})`, monthly.body?.error?.message)
  }
  await expire(monthly.body?.id)

  // Control: a zero trial must actually be rejected, proving the
  // omit-vs-zero distinction in the route is load-bearing and not cosmetic.
  const zero = await createSession({ price: PRO_ANNUAL, trialDays: 0 })
  if (zero.status !== 200) {
    pass('control: Stripe rejects trial_period_days: 0, so omitting it matters')
  } else {
    // Not a failure of our code, but the control did not hold — say so.
    fail('control did not hold: Stripe accepted trial_period_days: 0')
    await expire(zero.body?.id)
  }
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\ncheckout trial verification passed')
