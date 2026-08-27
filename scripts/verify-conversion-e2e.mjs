#!/usr/bin/env node
/**
 * verify-conversion-e2e.mjs
 *
 * Proves the whole loop: an expired pilot cannot write, a genuinely SIGNED
 * checkout.session.completed converts the org, and the same customer can write
 * again.
 *
 * The payload is signed the way Stripe signs it (HMAC-SHA256 over
 * "<timestamp>.<body>" with the endpoint secret), so this also exercises
 * signature verification — nothing else in the suite does.
 *
 * Needs the dev server running. Usage:
 *   node scripts/verify-conversion-e2e.mjs [env-file] [base-url]
 */

import { readFileSync } from 'fs'
import { createHmac } from 'crypto'
import { pathToFileURL } from 'url'
import { resolve } from 'path'

const ENV_PATH = process.argv[2] || '.env.local'
const BASE = (process.argv[3] || 'http://localhost:3000').replace(/\/+$/, '')

const env = {}
for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
const WHSEC = env.STRIPE_WEBHOOK_SECRET
const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

let failures = 0, checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => { checks++; failures++; console.log(`FAIL  ${m}`); if (d) console.log(`      ${String(d).slice(0, 250)}`) }

const created = { userId: null, orgId: null }
const day = n => new Date(Date.now() + n * 86400000).toISOString()

async function cleanup() {
  if (created.orgId) {
    for (const t of ['billing_events', 'entitlement_overrides', 'clients', 'subscriptions'])
      await fetch(`${U}/rest/v1/${t}?organization_id=eq.${created.orgId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
  }
  if (created.userId) await fetch(`${U}/rest/v1/users?id=eq.${created.userId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
  if (created.orgId) await fetch(`${U}/rest/v1/organizations?id=eq.${created.orgId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
  if (created.userId) await fetch(`${U}/auth/v1/admin/users/${created.userId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
}

async function org() {
  return (await (await fetch(`${U}/rest/v1/organizations?select=*&id=eq.${created.orgId}`, { headers: svcH })).json())[0]
}

async function main() {
  if (!WHSEC) { fail('STRIPE_WEBHOOK_SECRET missing from the env file'); return }

  try {
    const p = await fetch(`${BASE}/api/stripe/webhook`)
    if (!p.ok) { fail(`${BASE}/api/stripe/webhook not reachable (${p.status})`); return }
  } catch (err) { fail(`cannot reach ${BASE} -- start the dev server`, err?.message); return }

  const st = Date.now()
  const email = `unlazy-conv-${st}@example.invalid`
  const password = `Pw!${st}aA9`

  const uo = await (await fetch(`${U}/auth/v1/admin/users`, { method: 'POST', headers: svcH, body: JSON.stringify({ email, password, email_confirm: true }) })).json()
  if (!uo?.id) { fail('could not create probe user'); return }
  created.userId = uo.id

  // An expired pilot: day 31, unconverted. Exactly the customer who pays late.
  const o = (await (await fetch(`${U}/rest/v1/organizations`, { method: 'POST', headers: svcH, body: JSON.stringify({
    name: `__unlazy_conv_${st}`, slug: `unlazy-conv-${st}`, subscription_tier: 'starter', subscription_status: 'trialing',
    is_pilot: true, pilot_start_date: day(-31), pilot_end_date: day(-1), trial_ends_at: day(-1), converted_to_paid: false,
  }) })).json())[0]
  created.orgId = o.id
  await fetch(`${U}/rest/v1/users`, { method: 'POST', headers: svcH, body: JSON.stringify({
    id: created.userId, email, full_name: 'Conversion Probe', organization_id: created.orgId, role: 'owner' }) })

  const model = await import(pathToFileURL(resolve('lib/billing/access-model.ts')).href)

  // --- 1. the bug reproduces before the event -------------------
  const before = await org()
  if (!model.canWrite(before)) pass(`expired unconverted pilot cannot write (accessLevel=${model.accessLevel(before)})`)
  else fail('expired pilot could already write -- the precondition is wrong')

  // --- 2. fire a genuinely signed checkout.session.completed ----
  const event = {
    id: `evt_unlazy_${st}`,
    type: 'checkout.session.completed',
    data: { object: {
      id: `cs_unlazy_${st}`,
      object: 'checkout_session',
      customer: `cus_unlazy_${st}`,
      subscription: `sub_unlazy_${st}`,
      amount_total: 1440000,
      metadata: { organization_id: created.orgId },
    } },
  }
  const body = JSON.stringify(event)
  const ts = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', WHSEC).update(`${ts}.${body}`).digest('hex')

  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` },
    body,
  })
  const resText = await res.text()
  if (res.status === 200) pass('signed checkout.session.completed accepted (signature verification works)')
  else { fail(`webhook rejected the signed event (${res.status})`, resText); return }

  // --- 3. the org is converted ----------------------------------
  const after = await org()
  if (after.converted_to_paid === true) pass('converted_to_paid = true')
  else fail(`converted_to_paid = ${after.converted_to_paid}, expected true`)

  if (after.is_pilot === false) pass('is_pilot = false (pilot banner and countdown stop)')
  else fail(`is_pilot = ${after.is_pilot}, expected false`)

  // --- 4. the paying customer can write again -------------------
  if (model.canWrite(after)) pass(`paying customer CAN write again (accessLevel=${model.accessLevel(after)})`)
  else fail(`paying customer still cannot write (accessLevel=${model.accessLevel(after)})`)

  // --- 5. idempotent under a Stripe retry -----------------------
  const ts2 = Math.floor(Date.now() / 1000)
  const sig2 = createHmac('sha256', WHSEC).update(`${ts2}.${body}`).digest('hex')
  const retry = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${ts2},v1=${sig2}` }, body,
  })
  const afterRetry = await org()
  if (retry.status === 200 && afterRetry.converted_to_paid === true && afterRetry.is_pilot === false) {
    pass('a duplicate delivery is harmless (idempotent)')
  } else {
    fail(`retry changed the outcome (status ${retry.status}, converted=${afterRetry.converted_to_paid}, pilot=${afterRetry.is_pilot})`)
  }

  // --- 6. control: an unsigned event must be rejected ------------
  const bad = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${ts},v1=deadbeef` }, body,
  })
  if (bad.status === 400) pass('control: an incorrectly signed event is rejected 400')
  else fail(`control failed: a bad signature returned ${bad.status}, expected 400`)

  console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
}

main()
  .catch(err => fail(`unexpected error: ${err?.message || err}`))
  .finally(async () => {
    await cleanup()
    console.log('cleaned up probe org and user')
    if (failures > 0) { console.log(`\n${failures} check(s) failed.`); process.exit(1) }
    console.log('\nconversion e2e verification passed')
  })
