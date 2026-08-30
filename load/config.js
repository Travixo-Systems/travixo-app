// load/config.js
// Central configuration for the k6 harness. Everything is env-driven so the
// same scripts run against a local `next start`, a Vercel preview, or a
// throwaway Supabase project. Nothing here reads production defaults.

const env = (name, fallback) => {
  const v = __ENV[name];
  return v === undefined || v === '' ? fallback : v;
};

const int = (name, fallback) => {
  const v = parseInt(env(name, ''), 10);
  return Number.isFinite(v) ? v : fallback;
};

const bool = (name, fallback) => {
  const v = env(name, '');
  if (v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true';
};

// --- Targets ---------------------------------------------------------------

export const BASE_URL = env('BASE_URL', 'http://localhost:3000').replace(/\/+$/, '');
export const SUPABASE_URL = env('SUPABASE_URL', '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY', '');

// Guard rail: this harness must never be pointed at production. Add the
// production hostname to PROD_HOSTS (comma separated) in CI so a mistyped
// BASE_URL fails loudly instead of load-testing paying customers.
export const PROD_HOSTS = env('PROD_HOSTS', 'app.travixosystems.com')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

// --- Test accounts ---------------------------------------------------------
//
// The harness signs in with the Supabase password grant, exactly as the login
// page does (app/(auth)/login/page.tsx:73 calls signInWithPassword against
// GoTrue directly, not through the Next app). Seed accounts with
// load/seed/seed-load-users.mjs.

export const USER_EMAIL_PATTERN = env('USER_EMAIL_PATTERN', 'loadtest+{i}@example.invalid');
export const USER_PASSWORD = env('USER_PASSWORD', '');
export const USER_COUNT = int('USER_COUNT', 50);

// Fixtures the write scenarios need. Populate from the seed script output.
export const ASSET_ID = env('ASSET_ID', '');
export const ASSET_QR_CODE = env('ASSET_QR_CODE', '');
export const SCHEDULE_ID = env('SCHEDULE_ID', '');
// Single shared asset, used only by the write-contention profile.
export const CONTENTION_ASSET_ID = env('CONTENTION_ASSET_ID', ASSET_ID);
export const CONTENTION_ASSET_QR = env('CONTENTION_ASSET_QR', ASSET_QR_CODE);

// --- Behaviour knobs -------------------------------------------------------

// Models the UploadThing leg of "record inspection". The browser uploads the
// certificate to UploadThing and only then POSTs /api/vgp/inspections
// (app/(dashboard)/vgp/inspection/[id]/page.tsx:134-166), so end-to-end user
// latency includes an upload this harness does not perform. Set this to the
// measured p50 upload time for a representative certificate so the reported
// end-to-end number is honest.
export const UPLOAD_DELAY_MS = int('UPLOAD_DELAY_MS', 0);

// Write scenarios are destructive. Off by default: a run against a shared
// preview should not silently mutate it.
export const ENABLE_WRITES = bool('ENABLE_WRITES', false);

// Sleep between iterations, in seconds. Models user think time.
export const THINK_MIN = parseFloat(env('THINK_MIN', '1'));
export const THINK_MAX = parseFloat(env('THINK_MAX', '4'));

export const DEBUG = bool('DEBUG', false);

// Set by the cache_cold profile (or by hand). Every request then carries
// Cache-Control/Pragma: no-cache and a unique query parameter, so no CDN,
// browser or PostgREST-level cache can serve it. Combined with
// noConnectionReuse this measures the genuinely cold path.
export const CACHE_COLD = bool('CACHE_COLD', (env('PROFILE', '') || '').replace(/-/g, '_') === 'cache_cold');

// --- Thresholds ------------------------------------------------------------
//
// The envelope from the brief. Reads and mutations are separated by a custom
// trend so one slow PDF export cannot hide behind a fast dashboard call.

export const THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  read_latency: ['p(95)<500', 'p(99)<1500'],
  mutation_latency: ['p(95)<800', 'p(99)<1500'],
  // Every request, regardless of class, still has to respect the p99 ceiling.
  http_req_duration: ['p(99)<1500'],
  checks: ['rate>0.99'],
};

// Latency collapse detector. The harness records latency per 30s bucket; if a
// later bucket's p95 exceeds the first healthy bucket's p95 by this factor the
// run is reported as progressively collapsing rather than merely slow.
export const COLLAPSE_FACTOR = parseFloat(env('COLLAPSE_FACTOR', '3'));
export const BUCKET_SECONDS = int('BUCKET_SECONDS', 30);
// Buckets are surfaced as tagged sub-metrics, which must be declared up front
// (see lib/endpoints.js for why). 260 buckets of 30s covers the two-hour soak
// with room to spare; anything beyond is folded into the last bucket.
export const MAX_BUCKETS = int('MAX_BUCKETS', 260);

export function thinkTime() {
  return THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN);
}

export function assertNotProduction() {
  let host = '';
  try {
    host = BASE_URL.split('//')[1].split('/')[0].split(':')[0].toLowerCase();
  } catch (_) {
    host = BASE_URL.toLowerCase();
  }
  if (PROD_HOSTS.indexOf(host) !== -1) {
    throw new Error(
      `Refusing to run: BASE_URL host "${host}" is listed in PROD_HOSTS. ` +
        'Point BASE_URL at a preview or local deployment.'
    );
  }
}
