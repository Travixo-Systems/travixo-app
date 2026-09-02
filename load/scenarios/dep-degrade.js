// load/scenarios/dep-degrade.js
//
// 500 VUs while a downstream dependency (Resend / Stripe) is slow.
//
// -------------------------------------------------------------------------
// READ THIS BEFORE RUNNING - the app cannot currently be degraded from outside
// -------------------------------------------------------------------------
//
// The audit brief asks for "500u + slow Resend/Stripe mock". That requires
// pointing the app at a mock instead of the real service. As of this audit the
// app hardcodes both SDK base URLs:
//
//   - Resend is constructed as `new Resend(process.env.RESEND_API_KEY)` with no
//     configurable base URL (lib/email/email-service.ts).
//   - Stripe likewise (lib/stripe/*).
//
// Neither SDK reads a base-URL env var that the harness could repoint without
// changing app code, and this audit is strictly zero-app-change. So this
// scenario CANNOT inject latency on its own. It is delivered ready to run
// against an environment where the operator has done ONE of:
//
//   A. Set RESEND_API_KEY / STRIPE_SECRET_KEY to a mock server's key and
//      pointed DNS or a proxy at the mock (no app change - preferred).
//   B. Run the app behind an egress proxy (e.g. toxiproxy) that adds latency
//      to api.resend.com and api.stripe.com.
//
// Set DEGRADE_MODE to record which was used, so the report is honest about
// what was actually tested:
//
//   DEGRADE_MODE=none    (default) - no injection; this run measures the
//                                    BASELINE only and must not be reported
//                                    as a degradation result.
//   DEGRADE_MODE=resend  - Resend latency injected externally.
//   DEGRADE_MODE=stripe  - Stripe latency injected externally.
//
// The scenario drives the endpoints that BLOCK on those dependencies, which is
// what makes the blocking visible:
//   - team invite  -> awaits resend.emails.send() before responding
//                     (app/api/team/invitations/route.ts)
//   - checkout     -> pure Supabase, the control group. If invite latency
//                     climbs and checkout does not, the coupling is proven.

import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Trend, Counter } from 'k6/metrics'
import { login } from '../lib/auth.js'
import { testUsers, BASE_URL, ENABLE_WRITES, slotPath } from '../lib/config.js'
import { authFailures } from '../lib/metrics.js'
import { dashboard } from '../lib/scenarios.js'

const inviteLatency = new Trend('degrade_invite_latency', true)
const readLatencyUnderDegrade = new Trend('degrade_read_latency', true)
const inviteTimeouts = new Counter('degrade_invite_timeouts')

const MODE = __ENV.DEGRADE_MODE || 'none'

export const options = {
  scenarios: {
    degrade: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 500 },
        { duration: '7m', target: 500 },
        { duration: '1m', target: 0 },
      ],
      gracefulStop: '30s',
    },
  },
  thresholds: {
    // The POINT of this test: reads must stay healthy even when an email
    // provider is crawling. If this threshold fails while Resend is slow, the
    // blocking-on-Resend finding is confirmed under load.
    degrade_read_latency: ['p(95)<500'],
    travixo_auth_failures: ['count<1'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
}

const users = testUsers()

export function setup() {
  if (users.length === 0) throw new Error('[degrade] TEST_USERS is required.')
  if (MODE === 'none') {
    console.warn(
      '[degrade] DEGRADE_MODE=none. No latency is being injected, so this run ' +
        'is a BASELINE, not a degradation test. Report it as such.'
    )
  } else {
    console.log(`[degrade] running with externally injected latency on: ${MODE}`)
  }
  return { mode: MODE }
}

export default function (data) {
  const creds = users[(__VU - 1) % users.length]

  if (__ITER === 0) {
    const auth = login(creds.email, creds.password)
    if (!auth) {
      authFailures.add(1)
      sleep(5)
      return
    }
  }

  // Control group: a pure-Supabase read path. Should be unaffected by Resend.
  group('control_read', () => {
    const start = Date.now()
    dashboard()
    readLatencyUnderDegrade.add(Date.now() - start)
  })

  // The blocking path. Only 1 VU in 10 sends an invite: this is about latency
  // under degradation, not about generating thousands of invitation rows.
  if (ENABLE_WRITES && __VU % 10 === 0) {
    group('blocking_on_resend', () => {
      const email = `k6-load-${__VU}-${__ITER}@example.invalid`
      const res = http.post(
        `${BASE_URL}${slotPath('/api/team/invitations')}`,
        JSON.stringify({ email, role: 'member' }),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'degrade:invite' },
          timeout: '60s',
        }
      )
      inviteLatency.add(res.timings.duration)
      if (res.status === 0) inviteTimeouts.add(1)
      check(res, {
        'invite did not 5xx': (r) => r.status < 500,
      })
    })
  }

  sleep(Math.random() * 3 + 1)
}

export function handleSummary(data) {
  const read = data.metrics.degrade_read_latency?.values ?? {}
  const invite = data.metrics.degrade_invite_latency?.values ?? {}
  const lines = [
    '',
    '=== DEPENDENCY DEGRADATION SUMMARY ===',
    `  mode              : ${MODE}${MODE === 'none' ? '  (BASELINE ONLY - no injection)' : ''}`,
    `  read p95          : ${(read['p(95)'] ?? 0).toFixed(0)} ms   (budget 500)`,
    `  invite p95        : ${(invite['p(95)'] ?? 0).toFixed(0)} ms`,
    `  invite timeouts   : ${data.metrics.degrade_invite_timeouts?.values?.count ?? 0}`,
    '',
    '  Interpretation:',
    '    invite p95 tracks injected Resend latency  -> the response blocks on',
    '      the email send (confirms the finding).',
    '    read p95 also degrades                     -> worse: the blocked',
    '      invocations are starving shared capacity.',
    '    read p95 flat while invite climbs          -> blast radius contained',
    '      to the invite path.',
    '',
  ]
  return { stdout: lines.join('\n') }
}
