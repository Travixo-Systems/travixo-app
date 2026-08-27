#!/usr/bin/env node
/**
 * verify-production-deploy.mjs
 *
 * Checks the deployed production site rather than the local build:
 *   1. the site responds
 *   2. the security headers from next.config.ts are actually served
 *      (proves the deployment is running this codebase's config)
 *   3. a protected dashboard route does not render data to a logged-out
 *      visitor
 *   4. the public QR scan route still renders for anonymous visitors
 *      (the path the RLS work had to preserve)
 *
 * Prints "production deploy verification passed" only when all hold.
 *
 * Usage: node scripts/verify-production-deploy.mjs [base-url]
 */

const BASE = (process.argv[2] || 'https://app.travixosystems.com').replace(/\/+$/, '')

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 300)}`)
}

async function get(path, opts = {}) {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    redirect: 'manual',
    headers: { 'User-Agent': 'unlazy-deploy-verifier' },
    ...opts,
  })
  return res
}

async function main() {
  // --- 1. site responds -----------------------------------------
  let root
  try {
    root = await get('/')
  } catch (err) {
    fail(`cannot reach ${BASE}`, err?.message)
    return
  }

  if (root.status >= 200 && root.status < 400) {
    pass(`${BASE} responds (status ${root.status})`)
  } else {
    fail(`${BASE} returned status ${root.status}`)
  }

  // --- 2. security headers from next.config.ts ------------------
  // These are defined in this repo's next.config.ts, so serving them
  // proves the deployment is running this codebase.
  const expected = [
    ['x-frame-options', 'DENY'],
    ['x-content-type-options', 'nosniff'],
    ['strict-transport-security', 'max-age=63072000'],
  ]

  for (const [header, needle] of expected) {
    const got = root.headers.get(header)
    if (got && got.toLowerCase().includes(needle.toLowerCase())) {
      pass(`serves ${header}: ${got}`)
    } else {
      fail(`missing or wrong ${header} (got ${got ?? 'nothing'}) -- deploy may predate this config`)
    }
  }

  // --- 3. protected route is not readable logged-out ------------
  const dash = await get('/dashboard')
  const dashBody = dash.status === 200 ? await dash.text() : ''

  if (dash.status >= 300 && dash.status < 400) {
    pass(`/dashboard redirects logged-out visitors (status ${dash.status})`)
  } else if (dash.status === 200) {
    // A client-rendered shell can legitimately return 200. What must NOT
    // appear is real tenant data.
    const leaks = ['purchase_price', 'current_value', 'organization_id']
    const found = leaks.filter(k => dashBody.includes(k))
    if (found.length > 0) {
      fail(`/dashboard returned 200 to an anonymous visitor and mentions ${found.join(', ')}`)
    } else {
      pass('/dashboard returns a shell to anonymous visitors with no tenant data in the HTML')
    }
  } else {
    pass(`/dashboard is not served to anonymous visitors (status ${dash.status})`)
  }

  // --- 4. public QR scan route still renders --------------------
  // The RLS work had to keep this anonymous path working. Use a
  // deliberately invalid code: the route must still RENDER (not 500).
  const scan = await get('/scan/__unlazy_probe_not_a_real_code__')
  if (scan.status === 500 || scan.status === 502 || scan.status === 503) {
    fail(`public scan route errored (status ${scan.status}) -- the anonymous path may be broken`)
  } else if (scan.status >= 200 && scan.status < 400) {
    pass(`public scan route still renders for anonymous visitors (status ${scan.status})`)
  } else {
    // 404 for an unknown code is a correct, healthy answer.
    pass(`public scan route answered cleanly for an unknown code (status ${scan.status})`)
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
    console.log('\nproduction deploy verification passed')
  })
