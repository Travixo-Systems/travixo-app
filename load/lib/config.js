// load/lib/config.js
//
// Every knob the harness reads from the environment, in one place.
//
// Nothing here has a production default on purpose. BASE_URL has no default at
// all: a harness that silently falls back to a URL is a harness that will one
// day load-test the wrong thing. See load/README.md for the run commands.

/** Read a required env var, or fail loudly at init time rather than mid-run. */
function required(name) {
  const v = __ENV[name]
  if (!v || v.trim() === '') {
    throw new Error(
      `[config] ${name} is required. See load/README.md. ` +
        `Refusing to guess a target.`
    )
  }
  return v.trim()
}

function optional(name, fallback) {
  const v = __ENV[name]
  return v === undefined || v.trim() === '' ? fallback : v.trim()
}

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

/**
 * The app under test. MUST be a preview or local deployment.
 *
 * The guard below is deliberately noisy: the audit brief forbids load-testing
 * production, and an accidental `BASE_URL=https://app.travixosystems.com` is
 * the single most expensive mistake this harness could make. ALLOW_PROD_HOST
 * exists only so the check can be overridden consciously, never by accident.
 */
export const BASE_URL = required('BASE_URL').replace(/\/+$/, '')

const PROD_HOSTS = ['app.travixosystems.com', 'travixosystems.com']
const allowProd = optional('ALLOW_PROD_HOST', 'false') === 'true'

for (const host of PROD_HOSTS) {
  if (BASE_URL.includes(host) && !allowProd) {
    throw new Error(
      `[config] BASE_URL points at production (${host}). ` +
        `Load-testing production is out of scope for this audit. ` +
        `Use a preview deployment or a local 'next start'. ` +
        `If you genuinely intend this, set ALLOW_PROD_HOST=true.`
    )
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const SUPABASE_URL = optional('SUPABASE_URL', '').replace(/\/+$/, '')
export const SUPABASE_ANON_KEY = optional('SUPABASE_ANON_KEY', '')

// ---------------------------------------------------------------------------
// Vercel deployment protection
// ---------------------------------------------------------------------------

/**
 * Bypass token for a protected preview deployment.
 *
 * A Vercel preview sits behind SSO by default: every request, including
 * /login, answers 302 to vercel.com/sso-api. k6 cannot complete that OAuth
 * flow, so without this the harness measures the redirect rather than the app.
 *
 * Generate one at Project Settings -> Deployment Protection -> Protection
 * Bypass for Automation, and pass it in the environment. It is a credential:
 * never commit it, and never put it in a shell history you keep.
 *
 *   k6 run -e VERCEL_BYPASS_TOKEN=... load/scenarios/journey.js
 *
 * Vercel accepts it as the header below, and also as a query parameter. The
 * header is used here so the token stays out of request URLs, which is where
 * it would otherwise show up in logs and in k6's own per-URL metric tags.
 */
export const VERCEL_BYPASS_TOKEN = optional('VERCEL_BYPASS_TOKEN', '')

/**
 * Headers every request to the app must carry.
 *
 * Empty when no bypass token is set, so a local or unprotected target is
 * unaffected.
 */
export function appHeaders(extra) {
  const h = { ...(extra || {}) }
  if (VERCEL_BYPASS_TOKEN) {
    h['x-vercel-protection-bypass'] = VERCEL_BYPASS_TOKEN
    // Ask Vercel to set the bypass cookie too, so redirects within a VU's
    // session stay authorised without re-sending the token on every hop.
    h['x-vercel-set-bypass-cookie'] = 'samesitenone'
  }
  return h
}

/**
 * The auth cookie name.
 *
 * This is branch-dependent and getting it wrong is a silent failure: GoTrue
 * signs the VU in successfully, then every app route returns 401 because the
 * app reads a cookie name the harness never wrote.
 *
 *   - feat/multi-account-sessions-*  ->  'travixo-auth'   (lib/supabase/cookie-name.ts)
 *   - origin/main                    ->  'sb-<ref>-auth-token' (library default)
 *
 * Leave unset to derive the library default from SUPABASE_URL.
 */
const explicitCookieName = optional('AUTH_COOKIE_NAME', '')

/**
 * Account slot for the multi-account branch. Slot 0 (the default) uses the bare
 * cookie name and unprefixed URLs; slot N uses `<name>-N` and `/u/N/...` paths.
 * Mirrors cookieNameForSlot() in lib/supabase/account-slot.ts.
 */
export const ACCOUNT_SLOT = parseInt(optional('ACCOUNT_SLOT', '0'), 10) || 0

/** Project ref, parsed from the Supabase URL, for the library-default name. */
function projectRef() {
  if (!SUPABASE_URL) return null
  const m = SUPABASE_URL.match(/^https?:\/\/([^.]+)\./)
  return m ? m[1] : null
}

export function authCookieName() {
  const base = explicitCookieName || (projectRef() ? `sb-${projectRef()}-auth-token` : null)
  if (!base) {
    throw new Error(
      '[config] Cannot determine the auth cookie name. ' +
        'Set AUTH_COOKIE_NAME explicitly, or set SUPABASE_URL so it can be derived.'
    )
  }
  // Slot 0 keeps the bare name so existing sessions survive; see account-slot.ts.
  return ACCOUNT_SLOT === 0 ? base : `${base}-${ACCOUNT_SLOT}`
}

/**
 * Prefix a path with the account slot, mirroring withSlotPath() in the proxy.
 * Slot 0 is unprefixed.
 */
export function slotPath(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  return ACCOUNT_SLOT === 0 ? p : `/u/${ACCOUNT_SLOT}${p}`
}

// ---------------------------------------------------------------------------
// Test users
// ---------------------------------------------------------------------------

/**
 * Credentials. Two forms are supported:
 *   TEST_USER_EMAIL / TEST_USER_PASSWORD  - one shared user
 *   TEST_USERS = "a@x.com:pw,b@x.com:pw"  - a pool, one per VU (preferred)
 *
 * A pool matters above ~50 VUs: hammering one account serialises on that user's
 * rows and measures lock contention rather than app throughput.
 */
export function testUsers() {
  const pool = optional('TEST_USERS', '')
  if (pool) {
    return pool
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf(':')
        if (idx === -1) throw new Error(`[config] TEST_USERS entry missing ':' -> ${pair}`)
        return { email: pair.slice(0, idx), password: pair.slice(idx + 1) }
      })
  }
  const email = optional('TEST_USER_EMAIL', '')
  const password = optional('TEST_USER_PASSWORD', '')
  if (email && password) return [{ email, password }]
  return []
}

/**
 * The tenant the harness is meant to exercise.
 *
 * ZZ-LOADTEST-1 (e9248833-...) is a deliberately kept load-test organization
 * holding 1,000 assets, which is what makes payload measurements realistic.
 * Its sibling is ZZ-LOADTEST-2 (b35d5605-...).
 *
 * Neither may be deleted. See
 * docs/audit-followup/loadtest-credential-rotation.md, and note that their
 * seeded passwords need rotating before any run.
 *
 * This is a DEFAULT, not a lock: set TARGET_ORG_ID to point elsewhere. It
 * exists so a run without configuration hits the tenant sized for it rather
 * than whichever org the test user happens to belong to.
 */
export const LOADTEST_ORG_1 = 'e9248833-65db-43ad-b0cb-c76d58fd9abb' // ZZ-LOADTEST-1
export const LOADTEST_ORG_2 = 'b35d5605-6cbb-4977-8d11-fa312a90bc38' // ZZ-LOADTEST-2

export const TARGET_ORG_ID = optional('TARGET_ORG_ID', LOADTEST_ORG_1)

/** A known QR code for the public scan scenario. */
export const SCAN_QR_CODE = optional('SCAN_QR_CODE', '')

/** Opt-in for scenarios that write. Off by default: writes mutate real rows. */
export const ENABLE_WRITES = optional('ENABLE_WRITES', 'false') === 'true'

/** Asset id used by the write-contention scenario. */
export const CONTENTION_ASSET_ID = optional('CONTENTION_ASSET_ID', '')

export const DEBUG = optional('DEBUG', 'false') === 'true'
