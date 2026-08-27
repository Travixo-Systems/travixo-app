#!/usr/bin/env node
/**
 * verify-live-trial-length.mjs
 *
 * Measures what the LIVE database actually grants a new signup, by running
 * the real create_organization_and_user RPC as a real authenticated user and
 * reading back the pilot window. Then removes everything it created.
 *
 * Also checks that no existing pilot org is left on a window shorter than the
 * advertised 30 days.
 *
 * Prints "live trial length verification passed" only when all assertions hold.
 */

import { readFileSync } from 'fs'

const envPath = process.argv[2] || '.env.local'
const EXPECTED_DAYS = 30

const env = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
}

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_ || !ANON || !SVC) {
  console.log('FAIL  missing supabase env values')
  process.exit(1)
}

const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 300)}`)
}

const created = { userId: null, orgId: null }

async function cleanup() {
  if (created.userId) {
    await fetch(`${URL_}/rest/v1/users?id=eq.${created.userId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
  }
  if (created.orgId) {
    for (const t of ['entitlement_overrides', 'subscriptions']) {
      await fetch(`${URL_}/rest/v1/${t}?organization_id=eq.${created.orgId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
    }
    await fetch(`${URL_}/rest/v1/organizations?id=eq.${created.orgId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
  }
  if (created.userId) {
    await fetch(`${URL_}/auth/v1/admin/users/${created.userId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
  }
}

function daysBetween(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

async function main() {
  const stamp = Date.now()
  const email = `unlazy-trial-${stamp}@example.invalid`
  const password = `Pw!${stamp}aA9`

  // --- create + sign in a throwaway user ------------------------
  const mk = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST', headers: svcH,
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const userObj = await mk.json()
  if (!mk.ok || !userObj?.id) {
    fail(`could not create probe user (status ${mk.status})`, JSON.stringify(userObj))
    return
  }
  created.userId = userObj.id

  const si = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const tok = (await si.json())?.access_token
  if (!tok) { fail('probe user could not sign in'); return }

  // --- run the real signup RPC ----------------------------------
  const rpc = await fetch(`${URL_}/rest/v1/rpc/create_organization_and_user`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_org_name: 'Unlazy Trial Probe',
      p_org_slug: `unlazy-trial-probe-${stamp}`,
      p_user_id: created.userId,
      p_user_email: email,
      p_user_full_name: 'Trial Probe',
    }),
  })
  const rpcText = await rpc.text()
  if (!rpc.ok) { fail(`signup RPC failed (status ${rpc.status})`, rpcText); return }

  created.orgId = rpcText.replace(/"/g, '').trim()
  pass('signup RPC created an organization')

  // --- measure the granted window -------------------------------
  const org = (await (await fetch(
    `${URL_}/rest/v1/organizations?select=pilot_start_date,pilot_end_date,trial_ends_at&id=eq.${created.orgId}`,
    { headers: svcH }
  )).json())[0]

  if (!org?.pilot_start_date || !org?.pilot_end_date) {
    fail('new org has no pilot window')
  } else {
    const d = daysBetween(org.pilot_start_date, org.pilot_end_date)
    if (d === EXPECTED_DAYS) pass(`new signup receives a ${d}-day pilot (pilot_end_date)`)
    else fail(`new signup receives a ${d}-day pilot, expected ${EXPECTED_DAYS}`)

    const t = daysBetween(org.pilot_start_date, org.trial_ends_at)
    if (t === EXPECTED_DAYS) pass(`trial_ends_at is also ${t} days out`)
    else fail(`trial_ends_at is ${t} days out, expected ${EXPECTED_DAYS}`)
  }

  // --- feature grants must not expire before the pilot ----------
  const ents = await (await fetch(
    `${URL_}/rest/v1/entitlement_overrides?select=expires_at&organization_id=eq.${created.orgId}`,
    { headers: svcH }
  )).json()

  if (Array.isArray(ents) && ents.length > 0) {
    const early = ents.filter(e => e.expires_at && new Date(e.expires_at) < new Date(org.pilot_end_date))
    if (early.length === 0) pass(`all ${ents.length} pilot feature grants last the full window`)
    else fail(`${early.length} feature grant(s) expire before the pilot ends`)
  } else {
    fail('new org received no pilot feature grants')
  }

  // --- no existing pilot left on a short window -----------------
  const orgs = await (await fetch(
    `${URL_}/rest/v1/organizations?select=name,pilot_start_date,pilot_end_date&is_pilot=is.true&pilot_start_date=not.is.null&pilot_end_date=not.is.null&limit=500`,
    { headers: svcH }
  )).json()

  if (Array.isArray(orgs)) {
    const short = orgs
      .filter(o => o.id !== created.orgId)
      .map(o => ({ name: o.name, d: daysBetween(o.pilot_start_date, o.pilot_end_date) }))
      .filter(o => o.d < EXPECTED_DAYS)

    if (short.length === 0) {
      pass(`all ${orgs.length} existing pilot org(s) have a window of at least ${EXPECTED_DAYS} days`)
    } else {
      fail(
        `${short.length} pilot org(s) still on a short window`,
        short.slice(0, 8).map(o => `${o.name}: ${o.d}d`).join(', ')
      )
    }
  } else {
    fail('could not list existing pilot organizations')
  }

  console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
}

main()
  .catch(err => fail(`unexpected error: ${err?.message || err}`))
  .finally(async () => {
    await cleanup()
    console.log('cleaned up probe org and probe user')
    if (failures > 0) {
      console.log(`\n${failures} check(s) failed.`)
      process.exit(1)
    }
    console.log('\nlive trial length verification passed')
  })
