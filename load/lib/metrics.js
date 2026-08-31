// load/lib/metrics.js
//
// Custom metrics and the thresholds from the audit brief.
//
// Reads and mutations are tracked SEPARATELY because they have different
// budgets (500ms vs 800ms p95) and mixing them hides regressions: a page of
// fast reads will mask a slow write in an aggregate p95.

import { Trend, Rate, Counter } from 'k6/metrics'

// --- latency, split by operation class ------------------------------------
export const readLatency = new Trend('travixo_read_latency', true)
export const mutationLatency = new Trend('travixo_mutation_latency', true)

// --- per-scenario latency, to find WHICH flow saturates first --------------
export const loginLatency = new Trend('travixo_login_latency', true)
export const dashboardLatency = new Trend('travixo_dashboard_latency', true)
export const assetsListLatency = new Trend('travixo_assets_list_latency', true)
export const scanLatency = new Trend('travixo_scan_latency', true)
export const inspectionLatency = new Trend('travixo_inspection_latency', true)
export const reportLatency = new Trend('travixo_report_latency', true)

// --- correctness -----------------------------------------------------------
export const errorRate = new Rate('travixo_errors')
export const authFailures = new Counter('travixo_auth_failures')

/** Bytes actually received, to size Supabase/Vercel egress from a real run. */
export const bytesReceived = new Trend('travixo_bytes_received')

/**
 * Thresholds from the brief.
 *
 * `abortOnFail` is NOT set on latency: we want the run to finish so the
 * saturation curve is visible. A run that aborts at the first breach tells you
 * that it broke, but not where it broke, and where is the whole question.
 */
export const thresholds = {
  // <1% of requests may fail.
  http_req_failed: ['rate<0.01'],
  travixo_errors: ['rate<0.01'],

  // Reads: p95 < 500ms. Mutations: p95 < 800ms. Everything: p99 < 1.5s.
  travixo_read_latency: ['p(95)<500', 'p(99)<1500'],
  travixo_mutation_latency: ['p(95)<800', 'p(99)<1500'],

  // Overall guard.
  http_req_duration: ['p(95)<800', 'p(99)<1500'],

  // Any auth failure invalidates the run: the VUs are not exercising the app.
  travixo_auth_failures: ['count<1'],
}

/**
 * Record a response against the right metrics.
 *
 * @param res   k6 response
 * @param kind  'read' | 'mutation'
 * @param trend optional per-scenario Trend
 */
export function record(res, kind, trend) {
  const d = res.timings.duration
  if (kind === 'mutation') mutationLatency.add(d)
  else readLatency.add(d)
  if (trend) trend.add(d)

  // 4xx from a deliberate business rule (409 already_rented, 403 vgp_blocked)
  // is a CORRECT response under load, not an error. Counting it as failure
  // would make the write-contention scenario report a false collapse.
  const expected = res.status >= 200 && res.status < 400
  const businessRule = res.status === 409 || res.status === 403 || res.status === 422
  errorRate.add(!expected && !businessRule)

  if (res.body) bytesReceived.add(res.body.length)
  return res
}
