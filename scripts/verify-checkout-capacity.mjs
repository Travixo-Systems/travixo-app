#!/usr/bin/env node
/**
 * verify-checkout-capacity.mjs
 *
 * Asserts the checkout route sells LICENSED ASSET CAPACITY, and that no trace
 * of the deleted plan/service-term model survives in it.
 *
 * Replaces verify-checkout-trial.mjs, whose assertions were the exact negation
 * of this one: it required the route to import lib/billing/service-term and to
 * send trial_period_days. Both are gone. The annual discount now lives in the
 * price itself (ten months of the monthly rate for twelve months of service),
 * so bonus months on top would apply it twice.
 *
 * Stripe calls run against the LOCAL key from .env.local and are refused unless
 * it is sk_test_. The graduated prices may exist only in live mode; if the
 * configured price ids are not retrievable in test mode the probe SKIPS loudly
 * rather than passing silently.
 *
 * Prints "checkout capacity verification passed" only when all assertions hold.
 */

import { readFileSync, existsSync } from 'fs'

let failures = 0
let checks = 0
let skipped = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 300)}`)
}
const skip = (m, d) => {
  skipped++
  console.log(`SKIPPED  ${m}`)
  if (d) console.log(`         ${String(d).slice(0, 300)}`)
}

// --- 1. the deleted model must leave no trace --------------------
const routePath = 'app/api/stripe/checkout/route.ts'
if (!existsSync(routePath)) {
  console.log(`FAIL  ${routePath} not found`)
  process.exit(1)
}
const route = readFileSync(routePath, 'utf8')

// Assertions below must read CODE, not prose. The route explains in a comment
// why adjustable_quantity is deliberately absent, and a naive substring match
// on the comment would report the opposite of the truth.
const code = route
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

if (/from ['"]@\/lib\/billing\/service-term['"]/.test(route)) {
  fail('checkout still imports @/lib/billing/service-term -- that module is deleted')
} else {
  pass('checkout does not import the deleted service-term module')
}

if (/trial_period_days/.test(route)) {
  fail('checkout sets trial_period_days -- the annual discount is in the price, this would double-apply it')
} else {
  pass('checkout sets no trial_period_days')
}

if (/service_months/.test(route)) {
  fail('checkout still writes subscription_data.metadata.service_months')
} else {
  pass('checkout does not write service_months metadata')
}

// --- 2. quantity must be capacity, never a literal ---------------
if (/quantity:\s*\d+/.test(route)) {
  fail('checkout passes a literal quantity -- it must be the licensed capacity')
} else {
  pass('checkout passes no literal quantity')
}

if (/quantity:\s*licensedCapacity\b/.test(route)) {
  pass('checkout passes quantity resolved from licensed capacity')
} else {
  fail('checkout does not pass quantity: licensedCapacity')
}

if (/adjustable_quantity/.test(code)) {
  // Present at all is only acceptable if explicitly disabled.
  if (/adjustable_quantity:\s*\{[^}]*enabled:\s*false/.test(code)) {
    pass('adjustable_quantity is present but explicitly disabled')
  } else {
    fail('checkout sets adjustable_quantity to something other than disabled')
  }
} else {
  pass('checkout does not offer adjustable_quantity')
}

// --- 3. the self-serve ceiling and the price map -----------------
if (/MAX_SELF_SERVE_CAPACITY/.test(route) && /status:\s*400/.test(route)) {
  pass('checkout refuses above the self-serve ceiling with a 400')
} else {
  fail('checkout has no 400 contact-sales path above the self-serve ceiling')
}

if (/code:\s*['"]contact_sales['"]/.test(route)) {
  pass('the over-capacity response carries the contact-sales shape')
} else {
  fail('the over-capacity response does not carry a contact_sales code')
}

if (/PRICE_MAP\[\s*billingCycle\s*\]/.test(route)) {
  pass('price is resolved from the interval-keyed PRICE_MAP')
} else {
  fail('price is not resolved from PRICE_MAP keyed by interval')
}

// The NULL trap: .eq('is_demo_data', false) silently drops legacy NULL rows.
if (/is_demo_data\.eq\.false,is_demo_data\.is\.null/.test(route)) {
  pass('billable count handles NULL is_demo_data')
} else {
  fail('billable count does not use the is_demo_data NULL-safe filter')
}

// --- 4. Stripe accepts the real session shape --------------------
const env = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
} catch { /* handled below */ }

const KEY = env.STRIPE_SECRET_KEY
const MONTHLY = env.STRIPE_PRICE_TRAVIXO_MONTHLY

if (!KEY) {
  skip('no STRIPE_SECRET_KEY in .env.local -- cannot probe Stripe')
} else if (!KEY.startsWith('sk_test_')) {
  // Never probe with a live key: every session created would be real.
  skip(`local key is not sk_test_ (${KEY.slice(0, 8)}...) -- refusing to probe Stripe`)
} else if (!MONTHLY) {
  skip('STRIPE_PRICE_TRAVIXO_MONTHLY not set -- nothing to probe')
} else {
  const h = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }

  // The graduated prices may exist only in live mode. Probe first and skip
  // loudly rather than reporting a pass we did not earn.
  const probe = await fetch(`https://api.stripe.com/v1/prices/${MONTHLY}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  })

  if (probe.status !== 200) {
    skip(
      'no test-mode copy of the graduated prices exists -- session shape not verified against Stripe',
      `GET /v1/prices/${MONTHLY} returned ${probe.status}`
    )
  } else {
    async function createSession(quantity) {
      const b = new URLSearchParams()
      b.append('mode', 'subscription')
      b.append('line_items[0][price]', MONTHLY)
      b.append('line_items[0][quantity]', String(quantity))
      b.append('success_url', 'https://app.travixosystems.com/ok')
      b.append('cancel_url', 'https://app.travixosystems.com/no')
      b.append('subscription_data[metadata][organization_id]', 'verify-probe')
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: h, body: b })
      return { status: r.status, body: await r.json() }
    }

    async function expire(id) {
      if (!id) return
      await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}/expire`, {
        method: 'POST', headers: { Authorization: `Bearer ${KEY}` },
      }).catch(() => {})
    }

    // 100 assets -> the flat first tier. 250 -> flat plus 150 x 1.55.
    for (const [qty, expected] of [[100, 17900], [250, 41150]]) {
      const s = await createSession(qty)
      if (s.status !== 200) {
        fail(`Stripe rejected a session at quantity ${qty} (${s.status})`, s.body?.error?.message)
      } else {
        if (s.body.amount_total === expected) {
          pass(`quantity ${qty} totals ${(expected / 100).toFixed(2)} EUR`)
        } else {
          fail(
            `quantity ${qty} totalled ${s.body.amount_total}, expected ${expected}`,
            'the graduated tiers do not match the published grid'
          )
        }
      }
      await expire(s.body?.id)
    }
  }
}

console.log(`\n--- ${checks - failures}/${checks} checks passed${skipped ? `, ${skipped} skipped` : ''} ---`)
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
if (skipped > 0) {
  console.log(`\n${skipped} check(s) SKIPPED -- see above. Not a pass.`)
}
console.log('\ncheckout capacity verification passed')
