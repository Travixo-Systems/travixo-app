// load/scenarios/journey.js
//
// The default mixed-traffic test. Every profile in the brief (smoke, normal,
// busy, peak, target, spike, soak, cache-cold) runs THIS file with a different
// PROFILE env var, so the workload is identical across profiles and only the
// arrival shape changes. That is what makes the saturation point meaningful:
// if you change the mix between runs you cannot compare them.
//
//   k6 run -e PROFILE=normal load/scenarios/journey.js
//
// Traffic mix is weighted to look like a real working day rather than an even
// split: dashboards and asset lists dominate, reports are rare and expensive.

import { sleep } from 'k6'
import { Trend } from 'k6/metrics'
import { login } from '../lib/auth.js'
import { thresholds, authFailures, loginLatency } from '../lib/metrics.js'
import {
  dashboard,
  assetsList,
  scanPage,
  dreetsReport,
  referenceData,
  checkoutReturn,
  recordInspection,
  resolveOrgId,
} from '../lib/scenarios.js'
import { testUsers, ENABLE_WRITES, DEBUG } from '../lib/config.js'

// ---------------------------------------------------------------------------
// Load profiles
// ---------------------------------------------------------------------------
const PROFILES = {
  // 5 users, 5 minutes. Does the harness work at all?
  smoke: { executor: 'constant-vus', vus: 5, duration: '5m' },

  // A normal working day.
  normal: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 50 },
      { duration: '8m', target: 50 },
      { duration: '1m', target: 0 },
    ],
  },

  busy: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 250 },
      { duration: '7m', target: 250 },
      { duration: '1m', target: 0 },
    ],
  },

  peak: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 500 },
      { duration: '7m', target: 500 },
      { duration: '1m', target: 0 },
    ],
  },

  // The envelope: 1,000 concurrent users for 15 minutes.
  target: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '3m', target: 1000 },
      { duration: '11m', target: 1000 },
      { duration: '1m', target: 0 },
    ],
  },

  // 100 -> 1000 in 30s. Cold starts and pool exhaustion show up here or nowhere.
  spike: {
    executor: 'ramping-vus',
    startVUs: 100,
    stages: [
      { duration: '30s', target: 100 },
      { duration: '30s', target: 1000 },
      { duration: '3m', target: 1000 },
      { duration: '30s', target: 100 },
      { duration: '1m', target: 100 },
    ],
  },

  // 300 users for 2 hours. Looks for leaks and progressive latency collapse.
  soak: {
    executor: 'constant-vus',
    vus: 300,
    duration: '2h',
  },

  // Everything at once with no warmup: worst-case cold cache.
  'cache-cold': {
    executor: 'ramping-vus',
    startVUs: 1000,
    stages: [
      { duration: '5m', target: 1000 },
    ],
  },
}

const profileName = __ENV.PROFILE || 'smoke'
const profile = PROFILES[profileName]
if (!profile) {
  throw new Error(
    `[journey] unknown PROFILE '${profileName}'. ` +
      `Valid: ${Object.keys(PROFILES).join(', ')}`
  )
}

export const options = {
  scenarios: { journey: { ...profile, gracefulStop: '30s' } },
  thresholds,
  // Keep the summary readable and give p99 enough resolution to be trusted.
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
  noConnectionReuse: false,
  discardResponseBodies: false,

  // Keep the cookie jar across iterations.
  //
  // k6 clears it between iterations by default. This VU signs in once, on
  // __ITER === 0, so without this the session survives exactly one iteration
  // and every one after it answers 401 on authenticated routes -- while
  // sign-in itself keeps reporting success and travixo_auth_failures stays at
  // zero. That combination reads like a broken app and is a broken harness.
  //
  // A real user does not re-authenticate every few seconds either, so holding
  // the session is also the more faithful model.
  noCookiesReset: true,
}

// ---------------------------------------------------------------------------
// Per-VU state
// ---------------------------------------------------------------------------
const users = testUsers()

export function setup() {
  if (users.length === 0) {
    console.warn(
      '[journey] No TEST_USERS/TEST_USER_EMAIL configured. ' +
        'Running PUBLIC-ONLY traffic (scan page + reference data). ' +
        'Authenticated flows will be skipped.'
    )
  } else if (users.length === 1 && profileName !== 'smoke') {
    console.warn(
      `[journey] Only ONE test user for profile '${profileName}'. ` +
        'Above ~50 VUs this measures row-lock contention on one account, ' +
        'not app throughput. Set TEST_USERS with a pool.'
    )
  }
  return { userCount: users.length }
}

export default function (data) {
  // Public traffic needs no session.
  if (data.userCount === 0) {
    scanPage()
    referenceData()
    sleep(Math.random() * 3 + 1)
    return
  }

  // One user per VU, round-robin across the pool.
  const creds = users[(__VU - 1) % users.length]

  // Sign in when this VU has no session, then reuse the cookie jar.
  //
  // This used to key on __ITER === 0, which is wrong under a ramping
  // executor: VUs are started progressively and recycled, so a VU can begin
  // its life at a non-zero __ITER, never sign in, and spend the whole run
  // getting 401s from every authenticated route. At 5 constant VUs that never
  // showed; at 50 ramping VUs it produced a 1.6% failure rate that looked like
  // the app buckling under load and was nothing of the sort.
  //
  // Keying on the session itself is also simply the right question: "am I
  // signed in?" rather than "is this my first iteration?".
  if (!globalThis.__session) {
    const start = Date.now()
    const auth = login(creds.email, creds.password)
    loginLatency.add(Date.now() - start)
    if (!auth) {
      authFailures.add(1)
      if (DEBUG) console.error(`[journey] VU ${__VU} could not authenticate`)
      sleep(5)
      return
    }
    // Cache the org id on the VU for the direct-DB assets query.
    globalThis.__orgId = resolveOrgId(auth.session)
    globalThis.__session = auth.session
  }

  const session = globalThis.__session
  const orgId = globalThis.__orgId

  // Weighted mix. Reports are deliberately rare: they are expensive and a
  // realistic day has few of them, so an even split would overstate them.
  const roll = Math.random()
  if (roll < 0.35) {
    dashboard()
  } else if (roll < 0.65) {
    assetsList(session)
  } else if (roll < 0.8) {
    scanPage()
  } else if (roll < 0.88) {
    referenceData()
  } else if (roll < 0.95) {
    dreetsReport()
  } else if (ENABLE_WRITES) {
    // Writes are the smallest slice and only run when explicitly enabled.
    if (Math.random() < 0.5) checkoutReturn()
    else recordInspection(__ENV.INSPECTION_ASSET_ID)
  } else {
    dashboard()
  }

  // Think time. Without it VUs behave like a benchmark loop, not like users,
  // and the concurrency number stops meaning anything.
  sleep(Math.random() * 4 + 1)
}
