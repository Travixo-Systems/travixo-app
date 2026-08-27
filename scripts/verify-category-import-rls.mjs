#!/usr/bin/env node
/**
 * verify-category-import-rls.mjs
 *
 * Closes the gate that the browser-side asset import can still create
 * categories now that RLS is enabled on public.asset_categories.
 *
 * components/assets/ImportAssetsModal.tsx inserts categories from the browser
 * using the user's own token, so the INSERT policy has to allow a same-org
 * write and reject a cross-org one. This exercises that policy directly with
 * a real authenticated session rather than clicking through the UI, so it can
 * be re-run.
 *
 * It:
 *   1. creates a throwaway confirmed user via the admin API
 *   2. attaches that user to a real organization (mirroring public.users)
 *   3. signs in as them to get a genuine user JWT
 *   4. asserts a same-org category INSERT SUCCEEDS   (the import path)
 *   5. asserts a cross-org category INSERT is REJECTED (tenant isolation)
 *   6. asserts SELECT returns only the user's own org rows
 *   7. deletes every artifact it created
 *
 * Prints "category import verification passed" only when all assertions hold.
 */

import { readFileSync } from 'fs'

const envPath = process.argv[2] || '.env.local'

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

const svcH = {
  apikey: SVC,
  Authorization: `Bearer ${SVC}`,
  'Content-Type': 'application/json',
}

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 300)}`)
}

// Track everything created so cleanup is total even on failure.
const created = { userId: null, categoryIds: [] }

async function cleanup() {
  for (const id of created.categoryIds) {
    await fetch(`${URL_}/rest/v1/asset_categories?id=eq.${id}`, {
      method: 'DELETE', headers: svcH,
    }).catch(() => {})
  }
  if (created.userId) {
    await fetch(`${URL_}/rest/v1/users?id=eq.${created.userId}`, {
      method: 'DELETE', headers: svcH,
    }).catch(() => {})
    await fetch(`${URL_}/auth/v1/admin/users/${created.userId}`, {
      method: 'DELETE', headers: svcH,
    }).catch(() => {})
  }
}

async function main() {
  // --- pick two distinct real organizations -----------------------
  const orgsRes = await fetch(
    `${URL_}/rest/v1/asset_categories?select=organization_id&limit=200`,
    { headers: svcH }
  )
  const orgRows = await orgsRes.json()
  const orgIds = [...new Set((orgRows || []).map(r => r.organization_id).filter(Boolean))]

  if (orgIds.length < 2) {
    fail(`need 2 distinct organizations to test isolation, found ${orgIds.length}`)
    return
  }
  const homeOrg = orgIds[0]
  const otherOrg = orgIds[1]
  pass(`using home org ${homeOrg.slice(0, 8)}… and foreign org ${otherOrg.slice(0, 8)}…`)

  // --- create a throwaway confirmed user --------------------------
  const stamp = Date.now()
  const email = `unlazy-rls-probe-${stamp}@example.invalid`
  const password = `Pw!${stamp}aA9`

  const mkUser = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svcH,
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const mkBody = await mkUser.text()
  let userObj = null
  try { userObj = JSON.parse(mkBody) } catch {}

  if (!mkUser.ok || !userObj?.id) {
    fail(`could not create probe auth user (status ${mkUser.status})`, mkBody)
    return
  }
  created.userId = userObj.id
  pass('created throwaway confirmed auth user')

  // --- attach to the home org in public.users ---------------------
  const mkProfile = await fetch(`${URL_}/rest/v1/users`, {
    method: 'POST',
    headers: { ...svcH, Prefer: 'return=representation' },
    body: JSON.stringify({
      id: created.userId,
      email,
      full_name: 'Unlazy RLS Probe',
      organization_id: homeOrg,
    }),
  })
  const profBody = await mkProfile.text()
  if (!mkProfile.ok) {
    fail(`could not attach probe user to org (status ${mkProfile.status})`, profBody)
    return
  }
  pass('attached probe user to the home organization')

  // --- sign in to obtain a real user JWT --------------------------
  const signIn = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const signBody = await signIn.text()
  let tok = null
  try { tok = JSON.parse(signBody) } catch {}

  if (!signIn.ok || !tok?.access_token) {
    fail(`probe user could not sign in (status ${signIn.status})`, signBody)
    return
  }
  pass('probe user signed in and holds a user JWT')

  const userH = {
    apikey: ANON,
    Authorization: `Bearer ${tok.access_token}`,
    'Content-Type': 'application/json',
  }

  // --- 1. same-org INSERT must SUCCEED (the import path) ----------
  const goodName = `__unlazy_import_${stamp}`
  const insOk = await fetch(`${URL_}/rest/v1/asset_categories`, {
    method: 'POST',
    headers: { ...userH, Prefer: 'return=representation' },
    body: JSON.stringify({ name: goodName, organization_id: homeOrg }),
  })
  const insOkBody = await insOk.text()
  let insOkRows = null
  try { insOkRows = JSON.parse(insOkBody) } catch {}

  if (insOk.ok && Array.isArray(insOkRows) && insOkRows[0]?.id) {
    created.categoryIds.push(insOkRows[0].id)
    pass('authenticated same-org category INSERT succeeded -- import path works')
  } else {
    fail(
      `same-org category INSERT was rejected (status ${insOk.status}) -- asset import is BROKEN`,
      insOkBody
    )
  }

  // --- 2. cross-org INSERT must be REJECTED -----------------------
  const badName = `__unlazy_crossorg_${stamp}`
  const insBad = await fetch(`${URL_}/rest/v1/asset_categories`, {
    method: 'POST',
    headers: { ...userH, Prefer: 'return=representation' },
    body: JSON.stringify({ name: badName, organization_id: otherOrg }),
  })
  const insBadBody = await insBad.text()

  if (insBad.ok) {
    let rows = null
    try { rows = JSON.parse(insBadBody) } catch {}
    if (Array.isArray(rows) && rows[0]?.id) created.categoryIds.push(rows[0].id)
    fail(
      `cross-org category INSERT SUCCEEDED (status ${insBad.status}) -- tenant isolation is broken`,
      insBadBody
    )
  } else {
    pass(`cross-org category INSERT rejected (status ${insBad.status})`)
  }

  // --- 3. SELECT must return only the user's own org --------------
  const selRes = await fetch(
    `${URL_}/rest/v1/asset_categories?select=id,organization_id&limit=500`,
    { headers: userH }
  )
  let selRows = null
  try { selRows = JSON.parse(await selRes.text()) } catch {}

  if (!Array.isArray(selRows)) {
    fail('authenticated SELECT did not return an array')
  } else if (selRows.length === 0) {
    fail('authenticated SELECT returned 0 rows -- the dashboard category filter would be empty')
  } else {
    const foreign = selRows.filter(r => r.organization_id !== homeOrg)
    if (foreign.length > 0) {
      fail(`authenticated SELECT leaked ${foreign.length} row(s) from another organization`)
    } else {
      pass(`authenticated SELECT returned ${selRows.length} row(s), all from the user's own org`)
    }
  }

  console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
}

main()
  .catch(err => { fail(`unexpected error: ${err?.message || err}`) })
  .finally(async () => {
    await cleanup()
    console.log('cleaned up probe user and probe categories')
    if (failures > 0) {
      console.log(`\n${failures} check(s) failed.`)
      process.exit(1)
    }
    console.log('\ncategory import verification passed')
  })
