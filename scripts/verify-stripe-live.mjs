#!/usr/bin/env node
/**
 * verify-stripe-live.mjs
 *
 * Confirms production can actually take money.
 *
 * Presence checks cannot catch the failure that bites: a test key deployed to
 * production. `!!process.env.STRIPE_SECRET_KEY` is true for sk_test_ and
 * sk_live_ alike, which is how app.travixosystems.com ran in test mode while
 * its own config endpoint reported every field as `true`.
 *
 * Checks:
 *   1. production reports stripe_mode "live", with matching publishable key
 *   2. every price env var is set and shaped like a price id (not a
 *      buy.stripe.com Payment Link URL, which fails with "No such price")
 *   3. the webhook rejects an unsigned payload (signature verification is on)
 *   4. no organization still holds a test-mode stripe_customer_id, which
 *      breaks checkout for that org with "No such customer"
 *
 * Usage: node scripts/verify-stripe-live.mjs [base-url] [env-file]
 */

import { readFileSync } from 'fs'

const BASE = (process.argv[2] || 'https://app.travixosystems.com').replace(/\/+$/, '')
const ENV_PATH = process.argv[3] || '.env.local'

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 300)}`)
}

function loadEnv(p) {
  const out = {}
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  } catch { /* optional */ }
  return out
}

async function main() {
  // --- 1 + 2. production config --------------------------------
  let cfg
  try {
    const r = await fetch(`${BASE}/api/stripe/webhook`, { headers: { 'User-Agent': 'stripe-verifier' } })
    cfg = await r.json()
  } catch (err) {
    fail(`cannot reach ${BASE}/api/stripe/webhook`, err?.message)
    return
  }

  if (!('stripe_mode' in cfg)) {
    fail(
      'production still runs the presence-only config endpoint',
      'It reports `true` for a test key just as for a live one, so it cannot confirm the fix. Deploy the mode-reporting version.'
    )
  } else {
    if (cfg.stripe_mode === 'live') pass('production STRIPE_SECRET_KEY is a live key')
    else fail(`production stripe_mode is "${cfg.stripe_mode}" -- it cannot charge real cards`)

    if (cfg.publishable_mode === 'live') pass('production publishable key is live')
    else fail(`production publishable_mode is "${cfg.publishable_mode}"`)

    if (cfg.keys_consistent) pass('secret and publishable keys are in the same mode')
    else fail('secret and publishable keys are in DIFFERENT modes')

    if (cfg.webhook_secret) pass('STRIPE_WEBHOOK_SECRET is set')
    else fail('STRIPE_WEBHOOK_SECRET is missing -- payments would succeed without unlocking the account')

    const bad = Object.entries(cfg.prices || {}).filter(([, v]) => v !== 'ok')
    if (bad.length === 0) pass(`all ${Object.keys(cfg.prices || {}).length} price ids are set and well formed`)
    else fail(`${bad.length} price var(s) missing or malformed`, bad.map(([k, v]) => `${k}=${v}`).join(', '))

    if (cfg.ready_to_charge) pass('production reports ready_to_charge')
    else fail('production reports it is NOT ready to charge')
  }

  // --- 3. webhook signature verification ------------------------
  const wh = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=probe' },
    body: JSON.stringify({ id: 'evt_probe', type: 'ping' }),
  })
  if (wh.status === 400) pass('webhook rejects an unsigned payload (signature verification active)')
  else fail(`webhook returned ${wh.status} for an unsigned payload, expected 400`)

  // --- 4. stale test-mode customer ids --------------------------
  const env = loadEnv(ENV_PATH)
  const U = env.NEXT_PUBLIC_SUPABASE_URL
  const S = env.SUPABASE_SERVICE_ROLE_KEY
  const testKey = env.STRIPE_SECRET_KEY

  if (!U || !S) {
    fail(`no supabase credentials in ${ENV_PATH} -- cannot check for stale customer ids`)
  } else {
    const orgs = await (await fetch(
      `${U}/rest/v1/organizations?select=name,stripe_customer_id&stripe_customer_id=not.is.null`,
      { headers: { apikey: S, Authorization: `Bearer ${S}` } }
    )).json()

    if (!Array.isArray(orgs)) {
      fail('could not read organizations')
    } else if (orgs.length === 0) {
      pass('no organization holds a stripe_customer_id (nothing stale)')
    } else if (!testKey || !testKey.startsWith('sk_test_')) {
      // Without a test key we cannot classify; say so rather than guess.
      fail(
        `${orgs.length} org(s) hold a stripe_customer_id and no local test key is available to classify them`,
        orgs.map(o => o.name).join(', ')
      )
    } else {
      const stale = []
      for (const o of orgs) {
        const r = await fetch(`https://api.stripe.com/v1/customers/${o.stripe_customer_id}`, {
          headers: { Authorization: `Bearer ${testKey}` },
        })
        if (r.status === 200) stale.push(`${o.name} (${o.stripe_customer_id})`)
      }
      if (stale.length === 0) {
        pass(`${orgs.length} stored customer id(s), none visible in test mode`)
      } else {
        fail(
          `${stale.length} org(s) still hold a TEST-mode stripe_customer_id -- live checkout fails for them with "No such customer"`,
          stale.join(', ')
        )
      }
    }
  }

  console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
}

main()
  .catch(err => fail(`unexpected error: ${err?.message || err}`))
  .finally(() => {
    if (failures > 0) {
      console.log(`\n${failures} check(s) failed.`)
      process.exit(1)
    }
    console.log('\nstripe live verification passed')
  })
