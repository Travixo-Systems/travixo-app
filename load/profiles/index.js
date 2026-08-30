// load/profiles/index.js
//
// The ten load profiles from the brief. Each exports a k6 `options` object.
// Select one with PROFILE=<name>; see load/README.md.
//
// The traffic mix models a working day in an equipment-rental depot: staff
// mostly look at lists, field users scan, and the compliance work (inspections,
// DREETS export) is a smaller but far more expensive slice.

import { THRESHOLDS, MAX_BUCKETS } from '../config.js';
import { endpointThresholds } from '../lib/endpoints.js';

// Shorten any profile without editing it. Useful for a 30s validation run in
// CI before committing to a two-hour soak: `-e DURATION=30s`.
const DURATION_OVERRIDE = __ENV.DURATION || null;
const dur = (d) => DURATION_OVERRIDE || d;

// Permissive thresholds whose only job is to make k6 compute the tagged
// sub-metrics handleSummary reads back. They cannot fail a run.
function reportingThresholds() {
  const t = endpointThresholds();
  for (let b = 0; b < MAX_BUCKETS; b++) {
    t[`http_req_duration{bucket:${b}}`] = ['p(95)<86400000'];
  }
  return t;
}

const REPORTING = reportingThresholds();

/** Merge the real pass/fail thresholds with the reporting-only ones. */
function withReporting(thresholds) {
  return Object.assign({}, REPORTING, thresholds);
}

const MIX = [
  { key: 'dashboard', exec: 'dashboardScenario', weight: 0.3 },
  { key: 'assets', exec: 'assetsScenario', weight: 0.25 },
  { key: 'scan', exec: 'scanScenario', weight: 0.22 },
  { key: 'inspection', exec: 'inspectionScenario', weight: 0.1 },
  { key: 'dreets', exec: 'dreetsScenario', weight: 0.08 },
  { key: 'login', exec: 'loginScenario', weight: 0.05 },
];

const BASE = {
  thresholds: withReporting(THRESHOLDS),
  // Connection reuse mirrors a browser; turning it off would measure TLS, not
  // the app. cache-cold overrides this deliberately.
  noConnectionReuse: false,
  discardResponseBodies: false,
  // `count` is required: handleSummary reads it to decide whether a tagged
  // sub-metric saw any traffic, and k6 omits it from trend summaries otherwise.
  summaryTrendStats: ['count', 'avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

/** Split `total` VUs across the mix, never dropping a scenario to zero. */
function split(total) {
  const out = {};
  let assigned = 0;
  MIX.forEach((m, i) => {
    const isLast = i === MIX.length - 1;
    const n = isLast ? Math.max(1, total - assigned) : Math.max(1, Math.round(total * m.weight));
    assigned += n;
    out[m.key] = { exec: m.exec, vus: n };
  });
  return out;
}

function constantMix(total, duration, extra) {
  const parts = split(total);
  const scenarios = {};
  for (const key of Object.keys(parts)) {
    scenarios[key] = Object.assign(
      {
        executor: 'constant-vus',
        vus: parts[key].vus,
        duration: dur(duration),
        exec: parts[key].exec,
        tags: { scenario: key },
        gracefulStop: '30s',
      },
      extra || {}
    );
  }
  return scenarios;
}

function rampingMix(stages, extra) {
  // Stages are given for the whole run; each scenario gets its proportional
  // share of every stage target.
  const parts = split(100); // proportions out of 100
  const scenarios = {};
  for (const key of Object.keys(parts)) {
    const share = parts[key].vus / 100;
    scenarios[key] = Object.assign(
      {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: stages.map((s) => ({
          duration: s.duration,
          target: Math.max(1, Math.round(s.target * share)),
        })),
        exec: parts[key].exec,
        tags: { scenario: key },
        gracefulRampDown: '30s',
      },
      extra || {}
    );
  }
  return scenarios;
}

export const PROFILES = {
  // 1. smoke - does anything work at all, 5 users for 5 minutes.
  smoke: Object.assign({}, BASE, {
    scenarios: constantMix(5, '5m'),
    // A smoke run must be clean or the bigger runs are not worth starting.
    thresholds: withReporting(Object.assign({}, THRESHOLDS, { http_req_failed: ['rate<0.001'] })),
  }),

  // 2. normal - a quiet weekday.
  normal: Object.assign({}, BASE, { scenarios: constantMix(50, '10m') }),

  // 3. busy - Monday morning across several depots.
  busy: Object.assign({}, BASE, { scenarios: constantMix(250, '10m') }),

  // 4. peak - the busiest hour observed.
  peak: Object.assign({}, BASE, { scenarios: constantMix(500, '10m') }),

  // 5. target - the envelope: 1,000 concurrent users for 15 minutes.
  target: Object.assign({}, BASE, { scenarios: constantMix(1000, '15m') }),

  // 6. spike - 100 to 1,000 in thirty seconds, hold, drop.
  //    This is what a fleet-wide VGP alert email at 07:00 looks like.
  spike: Object.assign({}, BASE, {
    scenarios: rampingMix([
      { duration: '1m', target: 100 },
      { duration: '30s', target: 1000 },
      { duration: '3m', target: 1000 },
      { duration: '1m', target: 100 },
      { duration: '30s', target: 0 },
    ]),
  }),

  // 7. soak - 300 users for two hours. Finds leaks, pool exhaustion and the
  //    slow drift the shorter runs cannot see.
  soak: Object.assign({}, BASE, {
    scenarios: constantMix(300, '2h'),
    thresholds: withReporting(
      Object.assign({}, THRESHOLDS, {
        // Over two hours a single blip should not fail the run, but sustained
        // degradation must.
        http_req_failed: ['rate<0.01'],
        read_latency: ['p(95)<500', 'p(99)<1500'],
      })
    ),
  }),

  // 8. dep-degrade - 500 users while Resend and Stripe are slow.
  //    Point RESEND_BASE_URL at load/mocks/slow-deps.mjs before running; see
  //    the README for what can and cannot be injected without app changes.
  dep_degrade: Object.assign({}, BASE, {
    scenarios: {
      // Endpoints that block on a third party.
      dependency_heavy: {
        executor: 'constant-vus',
        vus: 200,
        duration: dur('10m'),
        exec: 'dependencyScenario',
        tags: { scenario: 'dependency_heavy' },
      },
      // Everything else, to show whether a slow dependency starves unrelated
      // traffic sharing the same function instances.
      background_reads: {
        executor: 'constant-vus',
        vus: 300,
        duration: dur('10m'),
        exec: 'dashboardScenario',
        tags: { scenario: 'background_reads' },
      },
    },
    thresholds: withReporting({
      // The point of this run is isolation: reads that touch no third party
      // must stay fast even while dependency-bound routes are slow.
      'read_latency{scenario:background_reads}': ['p(95)<500'],
      'http_req_failed{scenario:background_reads}': ['rate<0.01'],
      checks: ['rate>0.90'],
    }),
  }),

  // 9. write-contention - every VU mutates the SAME asset. Measures whether
  //    checkout_asset/return_asset serialise cleanly or deadlock, and whether
  //    the scan last_seen stamp turns into row-lock queueing.
  write_contention: Object.assign({}, BASE, {
    scenarios: {
      contention: {
        executor: 'constant-vus',
        vus: 100,
        duration: dur('5m'),
        exec: 'contentionScenario',
        tags: { scenario: 'contention' },
      },
    },
    thresholds: withReporting({
      // 409 already_rented is the correct answer here, not an error, so the
      // check rate matters more than the status mix.
      checks: ['rate>0.95'],
      mutation_latency: ['p(95)<800', 'p(99)<1500'],
    }),
  }),

  // 10. cache-cold - 1,000 users, nothing warm: fresh connections, no reuse,
  //     cache-busting query strings, Cache-Control: no-cache on every request.
  cache_cold: Object.assign({}, BASE, {
    noConnectionReuse: true,
    scenarios: constantMix(1000, '10m'),
    thresholds: withReporting(
      Object.assign({}, THRESHOLDS, {
        // A cold run is allowed to be slower, but not unboundedly so.
        read_latency: ['p(95)<1200'],
        mutation_latency: ['p(95)<1500'],
        http_req_duration: ['p(99)<3000'],
      })
    ),
  }),
};

export function resolveProfile(name) {
  const key = (name || 'smoke').replace(/-/g, '_');
  const p = PROFILES[key];
  if (!p) {
    throw new Error(
      `Unknown PROFILE "${name}". Available: ${Object.keys(PROFILES).join(', ')}`
    );
  }
  return { key: key, options: p };
}
