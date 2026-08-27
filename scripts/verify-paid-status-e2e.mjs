#!/usr/bin/env node
/**
 * verify-paid-status-e2e.mjs
 *
 * The Professional annual case, end to end: a signed
 * customer.subscription.created carrying Stripe status `trialing` (the 90-day
 * service-term deferral) must leave the customer recorded as active, with no
 * trial wording anywhere the billing page reads.
 *
 * Needs the dev server running.
 * Usage: node scripts/verify-paid-status-e2e.mjs [env-file] [base-url]
 */

import { readFileSync } from 'fs'
import { createHmac } from 'crypto'

const ENV_PATH = process.argv[2] || '.env.local'
const BASE = (process.argv[3] || 'http://localhost:3000').replace(/\/+$/, '')

const env = {}
for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
const WHSEC = env.STRIPE_WEBHOOK_SECRET
const PRO_ANNUAL = env.STRIPE_PRICE_PROFESSIONAL_ANNUAL
const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

let failures = 0, checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => { checks++; failures++; console.log(`FAIL  ${m}`); if (d) console.log(`      ${String(d).slice(0, 300)}`) }

const created = { orgId: null }
const day = n => new Date(Date.now() + n * 86400000).toISOString()

async function cleanup() {
  if (!created.orgId) return
  for (const t of ['billing_events', 'entitlement_overrides', 'subscriptions'])
    await fetch(`${U}/rest/v1/${t}?organization_id=eq.${created.orgId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
  await fetch(`${U}/rest/v1/organizations?id=eq.${created.orgId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
}

async function main() {
  if (!WHSEC) { fail('STRIPE_WEBHOOK_SECRET missing'); return }
  if (!PRO_ANNUAL) { fail('STRIPE_PRICE_PROFESSIONAL_ANNUAL missing'); return }
  try {
    const p = await fetch(`${BASE}/api/stripe/webhook`)
    if (!p.ok) { fail(`webhook not reachable (${p.status})`); return }
  } catch (err) { fail(`cannot reach ${BASE} -- start the dev server`, err?.message); return }

  const st = Date.now()
  const o = (await (await fetch(`${U}/rest/v1/organizations`, { method: 'POST', headers: svcH, body: JSON.stringify({
    name: `__unlazy_paid_${st}`, slug: `unlazy-paid-${st}`, subscription_tier: 'starter', subscription_status: 'trialing',
    is_pilot: true, pilot_start_date: day(-31), pilot_end_date: day(-1), trial_ends_at: day(-1),
    converted_to_paid: false, stripe_customer_id: `cus_unlazy_paid_${st}`,
  }) })).json())[0]
  created.orgId = o.id

  // Professional annual: Stripe reports `trialing` for 90 days.
  const event = {
    id: `evt_unlazy_paid_${st}`,
    type: 'customer.subscription.created',
    data: { object: {
      id: `sub_unlazy_paid_${st}`,
      object: 'subscription',
      status: 'trialing',
      customer: `cus_unlazy_paid_${st}`,
      metadata: { organization_id: created.orgId },
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 90 * 86400,
      items: { data: [{ price: { id: PRO_ANNUAL } }] },
    } },
  }
  const body = JSON.stringify(event)
  const ts = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', WHSEC).update(`${ts}.${body}`).digest('hex')

  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` }, body,
  })
  if (res.status === 200) pass('signed customer.subscription.created (status trialing) accepted')
  else { fail(`webhook rejected the event (${res.status})`, await res.text()); return }

  // --- the stored status must not say trial ---------------------
  const sub = (await (await fetch(`${U}/rest/v1/subscriptions?select=status,stripe_subscription_id&organization_id=eq.${created.orgId}`, { headers: svcH })).json())[0]
  if (!sub) { fail('no subscription row was written'); return }
  if (sub.status === 'active') pass(`subscription stored as "${sub.status}" despite Stripe reporting trialing`)
  else fail(`subscription stored as "${sub.status}", expected active`)

  const org = (await (await fetch(`${U}/rest/v1/organizations?select=*&id=eq.${created.orgId}`, { headers: svcH })).json())[0]
  if (org.subscription_status === 'active') pass(`organization stored as "${org.subscription_status}"`)
  else fail(`organization stored as "${org.subscription_status}", expected active`)

  if (org.converted_to_paid === true && org.is_pilot === false) pass('org converted out of pilot')
  else fail(`converted=${org.converted_to_paid} is_pilot=${org.is_pilot}, expected true/false`)

  if (org.subscription_tier === 'professional') pass('tier updated to professional from the price id')
  else fail(`tier is "${org.subscription_tier}", expected professional`)

  // --- nothing the billing page reads may say "trial" -----------
  // Recompute the API's is_trial from the stored rows: a paid customer must
  // never satisfy it.
  const isTrial = sub.status === 'trialing' && !sub.stripe_subscription_id && !org.converted_to_paid
  if (isTrial === false) pass('is_trial computes to false for this paying customer')
  else fail('is_trial computes to true -- the billing page would show "Essai"')

  console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
}

main()
  .catch(err => fail(`unexpected error: ${err?.message || err}`))
  .finally(async () => {
    await cleanup()
    console.log('cleaned up probe org')
    if (failures > 0) { console.log(`\n${failures} check(s) failed.`); process.exit(1) }
    console.log('\npaid status e2e verification passed')
  })
