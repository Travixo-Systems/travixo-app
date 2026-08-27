#!/usr/bin/env node
/**
 * verify-readonly-enforcement.mjs
 *
 * Proves the read-only window is enforced by the SERVER, not just rendered by
 * the UI. Creates a throwaway org and user, signs in as them, and calls a real
 * mutating API route at three points in the lifecycle.
 *
 * The dev server must be running (default http://localhost:3000).
 *
 * Prints "readonly enforcement verification passed" only when an active pilot
 * can write and an expired one cannot.
 *
 * Usage: node scripts/verify-readonly-enforcement.mjs [env-file] [base-url]
 */

import { readFileSync } from 'fs'

const ENV_PATH = process.argv[2] || '.env.local'
const BASE = (process.argv[3] || process.env.VERIFY_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')

const env = {}
for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

let failures = 0, checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => { checks++; failures++; console.log(`FAIL  ${m}`); if (d) console.log(`      ${String(d).slice(0, 250)}`) }

const created = { userId: null, orgId: null, subId: null }
const day = n => new Date(Date.now() + n * 86400000).toISOString()

async function cleanup() {
  if (created.subId) await fetch(`${U}/rest/v1/subscriptions?id=eq.${created.subId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
  if (created.orgId) {
    for (const t of ['entitlement_overrides', 'clients', 'subscriptions'])
      await fetch(`${U}/rest/v1/${t}?organization_id=eq.${created.orgId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
  }
  if (created.userId) await fetch(`${U}/rest/v1/users?id=eq.${created.userId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
  if (created.orgId) await fetch(`${U}/rest/v1/organizations?id=eq.${created.orgId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
  if (created.userId) await fetch(`${U}/auth/v1/admin/users/${created.userId}`, { method: 'DELETE', headers: svcH }).catch(() => {})
}

async function setWindow(startOff, endOff) {
  await fetch(`${U}/rest/v1/organizations?id=eq.${created.orgId}`, {
    method: 'PATCH', headers: svcH,
    body: JSON.stringify({ pilot_start_date: day(startOff), pilot_end_date: day(endOff), trial_ends_at: day(endOff) }),
  })
}

async function main() {
  // Reachability first, so a stopped dev server is not reported as a pass.
  try {
    const ping = await fetch(`${BASE}/api/clients`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    if (ping.status === 404) { fail(`${BASE}/api/clients returned 404 -- wrong base url?`); return }
  } catch (err) {
    fail(`cannot reach ${BASE} -- start the dev server (npm run dev)`, err?.message); return
  }

  const st = Date.now()
  const email = `unlazy-ro-${st}@example.invalid`
  const password = `Pw!${st}aA9`

  const mk = await fetch(`${U}/auth/v1/admin/users`, { method: 'POST', headers: svcH, body: JSON.stringify({ email, password, email_confirm: true }) })
  const uo = await mk.json()
  if (!uo?.id) { fail('could not create probe user', JSON.stringify(uo)); return }
  created.userId = uo.id

  const org = (await (await fetch(`${U}/rest/v1/organizations`, { method: 'POST', headers: svcH, body: JSON.stringify({
    name: `__unlazy_ro_${st}`, slug: `unlazy-ro-${st}`, subscription_tier: 'starter', subscription_status: 'trialing',
    is_pilot: true, pilot_start_date: day(-1), pilot_end_date: day(29), trial_ends_at: day(29), converted_to_paid: false,
  }) })).json())[0]
  created.orgId = org.id

  await fetch(`${U}/rest/v1/users`, { method: 'POST', headers: svcH, body: JSON.stringify({
    id: created.userId, email, full_name: 'Readonly Probe', organization_id: created.orgId, role: 'owner' }) })

  const si = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }) })
  const sessionBody = await si.json()
  const tok = sessionBody?.access_token
  if (!tok) { fail('probe user could not sign in', JSON.stringify(sessionBody)); return }

  // Supabase SSR reads the session from a project-scoped cookie holding the
  // whole session as base64-encoded JSON, not a bare access token. The Origin
  // header is required by the CSRF check in proxy.ts, which rejects same-site
  // mutations without it.
  const projectRef = new URL(U).hostname.split('.')[0]
  const cookieValue = 'base64-' + Buffer.from(JSON.stringify(sessionBody)).toString('base64')
  const cookie = `sb-${projectRef}-auth-token=${cookieValue}`
  const authH = {
    'Content-Type': 'application/json',
    Cookie: cookie,
    Authorization: `Bearer ${tok}`,
    Origin: BASE,
    Referer: `${BASE}/clients`,
  }

  async function tryWrite(label) {
    const r = await fetch(`${BASE}/api/clients`, {
      method: 'POST', headers: authH,
      body: JSON.stringify({ name: `probe ${label} ${Date.now()}` }),
    })
    let body = null
    try { body = await r.json() } catch {}
    return { status: r.status, error: body?.error }
  }

  // --- active pilot: the write must SUCCEED ---------------------
  await setWindow(-1, 29)
  const active = await tryWrite('active')
  if (active.status === 401) {
    fail('probe could not authenticate against the API -- cookie shape may differ', JSON.stringify(active))
    return
  }
  if (active.status >= 200 && active.status < 300) pass(`active pilot CAN write (status ${active.status})`)
  else fail(`active pilot was refused (status ${active.status}, ${active.error}) -- the gate is too aggressive`)

  // --- read-only window: the write must be REFUSED --------------
  await setWindow(-40, -10)
  const ro = await tryWrite('readonly')
  if (ro.status === 423 && ro.error === 'pilot_read_only') pass('expired pilot is REFUSED (423 pilot_read_only)')
  else if (ro.status >= 200 && ro.status < 300) fail(`expired pilot could still write (status ${ro.status}) -- read-only is NOT enforced`)
  else fail(`expired pilot refused with an unexpected result (status ${ro.status}, ${ro.error})`)

  // --- past lockout: refused, with the locked reason -------------
  await setWindow(-60, -30)
  const locked = await tryWrite('locked')
  if (locked.status === 423 && locked.error === 'account_locked') pass('locked account is REFUSED (423 account_locked)')
  else if (locked.status >= 200 && locked.status < 300) fail(`locked account could still write (status ${locked.status})`)
  else fail(`locked account refused with an unexpected result (status ${locked.status}, ${locked.error})`)

  // --- converted customer is unaffected --------------------------
  await fetch(`${U}/rest/v1/organizations?id=eq.${created.orgId}`, { method: 'PATCH', headers: svcH, body: JSON.stringify({ converted_to_paid: true }) })
  const paid = await tryWrite('paid')
  if (paid.status >= 200 && paid.status < 300) pass('converted (paying) customer CAN write despite an expired pilot')
  else fail(`converted customer was refused (status ${paid.status}, ${paid.error}) -- paying customers must never be gated`)

  console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
  if (failures === 0) console.log('active pilot unaffected')
}

main()
  .catch(err => fail(`unexpected error: ${err?.message || err}`))
  .finally(async () => {
    await cleanup()
    console.log('cleaned up probe org and user')
    if (failures > 0) { console.log(`\n${failures} check(s) failed.`); process.exit(1) }
    console.log('\nreadonly enforcement verification passed')
  })
