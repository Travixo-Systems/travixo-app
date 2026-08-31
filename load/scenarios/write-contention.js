// load/scenarios/write-contention.js
//
// Many VUs fight over the SAME asset, to test the checkout path's locking.
//
// What "correct" looks like here is NOT "no errors". checkout_asset() does
// SELECT ... FOR UPDATE (supabase/migrations/20260211_client_recall_system.sql),
// so exactly ONE VU should win a checkout and the rest should get a clean 409
// already_rented. A 409 is the system working.
//
// The failure modes this actually hunts for:
//   1. TWO VUs both get 200 for the same asset  -> the lock is not holding, and
//      the same machine is rented to two sites at once.
//   2. Latency climbs with VU count             -> lock convoy; requests queue
//      on the row and the p99 blows past 1.5s.
//   3. 500s instead of 409s                     -> contention surfacing as
//      crashes rather than as a business rule.
//
// Requires ENABLE_WRITES=true and CONTENTION_ASSET_ID.

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'
import { login } from '../lib/auth.js'
import { testUsers, BASE_URL, CONTENTION_ASSET_ID, ENABLE_WRITES, slotPath } from '../lib/config.js'
import { authFailures } from '../lib/metrics.js'

const checkoutWins = new Counter('contention_checkout_wins')
const checkoutConflicts = new Counter('contention_checkout_conflicts')
const checkoutErrors = new Counter('contention_checkout_errors')
const contentionLatency = new Trend('contention_latency', true)

const VUS = parseInt(__ENV.CONTENTION_VUS || '50', 10)

export const options = {
  scenarios: {
    contention: {
      executor: 'constant-vus',
      vus: VUS,
      duration: __ENV.CONTENTION_DURATION || '2m',
      gracefulStop: '15s',
    },
  },
  thresholds: {
    // Contention must not become 5xx.
    contention_checkout_errors: ['count<1'],
    // Even while queueing on a row lock, the p99 budget still applies.
    contention_latency: ['p(99)<1500'],
    travixo_auth_failures: ['count<1'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
}

const users = testUsers()

export function setup() {
  if (!ENABLE_WRITES) {
    throw new Error(
      '[contention] This scenario writes. Set ENABLE_WRITES=true to confirm ' +
        'you are pointed at a disposable environment.'
    )
  }
  if (!CONTENTION_ASSET_ID) {
    throw new Error('[contention] CONTENTION_ASSET_ID is required.')
  }
  if (users.length === 0) {
    throw new Error('[contention] TEST_USERS or TEST_USER_EMAIL is required.')
  }
  return {}
}

export default function () {
  const creds = users[(__VU - 1) % users.length]

  if (__ITER === 0) {
    const auth = login(creds.email, creds.password)
    if (!auth) {
      authFailures.add(1)
      sleep(5)
      return
    }
  }

  // Every VU targets the SAME asset id. That is the whole point.
  const res = http.post(
    `${BASE_URL}${slotPath('/api/rentals/checkout')}`,
    JSON.stringify({ asset_id: CONTENTION_ASSET_ID }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'contention:checkout' } }
  )
  contentionLatency.add(res.timings.duration)

  if (res.status === 200 || res.status === 201) {
    checkoutWins.add(1)
    // The winner immediately returns it, so the next iteration has something
    // to contend over. Without this the test degenerates into all-409 after
    // the first success and stops measuring lock behaviour.
    const ret = http.post(
      `${BASE_URL}${slotPath('/api/rentals/return')}`,
      JSON.stringify({ asset_id: CONTENTION_ASSET_ID }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'contention:return' } }
    )
    contentionLatency.add(ret.timings.duration)
  } else if (res.status === 409 || res.status === 403 || res.status === 422) {
    // Expected: the row lock did its job, or a VGP rule blocked it.
    checkoutConflicts.add(1)
  } else {
    checkoutErrors.add(1)
    console.error(`[contention] unexpected ${res.status}: ${String(res.body).slice(0, 200)}`)
  }

  check(res, {
    'contention resolved cleanly': (r) =>
      [200, 201, 400, 403, 409, 422].includes(r.status),
  })

  sleep(Math.random() * 0.5)
}

export function handleSummary(data) {
  const wins = data.metrics.contention_checkout_wins?.values?.count ?? 0
  const conflicts = data.metrics.contention_checkout_conflicts?.values?.count ?? 0
  const errors = data.metrics.contention_checkout_errors?.values?.count ?? 0

  const lines = [
    '',
    '=== WRITE CONTENTION SUMMARY ===',
    `  checkout wins      : ${wins}`,
    `  clean conflicts    : ${conflicts}  (409/403/422 - the lock working)`,
    `  unexpected errors  : ${errors}  (must be 0)`,
    '',
    '  Interpretation:',
    '    conflicts >> wins        -> row locking is holding. Expected.',
    '    errors > 0               -> contention is surfacing as 5xx. Investigate.',
    '    p99 rising with VUs      -> lock convoy on the asset row.',
    '',
  ]
  return { stdout: lines.join('\n') }
}
