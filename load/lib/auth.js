// load/lib/auth.js
//
// Turns an email/password into the cookie jar the app expects.
//
// The app never sees the harness "log in". It sees a request carrying a cookie
// that @supabase/ssr can parse. So this module talks to GoTrue directly, then
// writes the session into cookies in EXACTLY the encoding the server client
// reads. Three details are load-bearing, and each one fails silently if wrong:
//
//   1. NAME    - branch-dependent. See config.authCookieName().
//   2. ENCODING- '@supabase/ssr' writes `base64-` + base64url(JSON).
//                (node_modules/@supabase/ssr/dist/main/cookies.js:7)
//   3. CHUNKING- values over 3180 bytes are split into `<name>.0`, `<name>.1`.
//                (node_modules/@supabase/ssr/dist/main/utils/chunker.js:8)
//                A real session token exceeds this, so a harness that skips
//                chunking sends one oversized cookie, the server reads a
//                truncated/absent session, and every route 401s while the
//                sign-in itself looked fine.
//
// If auth "succeeds" but every request 401s, check these three first.

import http from 'k6/http'
import encoding from 'k6/encoding'
import { check } from 'k6'
import { BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, authCookieName, DEBUG } from './config.js'

/** Matches MAX_CHUNK_SIZE in @supabase/ssr. */
const MAX_CHUNK_SIZE = 3180

/**
 * base64url without padding, matching the browser's btoa-based encoder that
 * @supabase/ssr uses. k6's std encoder emits standard base64; the '+' and '/'
 * characters are not cookie-safe and '=' padding is stripped by the library.
 */
function base64url(str) {
  return encoding
    .b64encode(str, 'std')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Sign in against GoTrue and return the raw session object.
 * Returns null on failure rather than throwing, so a scenario can decide
 * whether a failed login is fatal or just a recorded error.
 */
export function signIn(email, password) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      '[auth] SUPABASE_URL and SUPABASE_ANON_KEY are required to sign in. ' +
        'See load/README.md.'
    )
  }

  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email, password }),
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      tags: { name: 'auth:signin' },
    }
  )

  const ok = check(res, {
    'signin returned 200': (r) => r.status === 200,
  })

  if (!ok) {
    if (DEBUG) {
      console.error(`[auth] sign-in failed for ${email}: ${res.status} ${res.body}`)
    }
    return null
  }

  let session
  try {
    session = res.json()
  } catch (e) {
    console.error(`[auth] sign-in response was not JSON: ${res.body}`)
    return null
  }

  if (!session || !session.access_token) {
    console.error('[auth] sign-in succeeded but no access_token in response')
    return null
  }
  return session
}

/**
 * Encode a GoTrue session the way @supabase/ssr stores it, returning a map of
 * { cookieName: value } that may contain multiple chunks.
 */
export function sessionToCookies(session) {
  const name = authCookieName()

  // The shape @supabase/ssr persists. Extra fields from GoTrue are harmless;
  // omitting the ones below is not.
  const payload = {
    access_token: session.access_token,
    token_type: session.token_type || 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  }

  const value = `base64-${base64url(JSON.stringify(payload))}`

  if (value.length <= MAX_CHUNK_SIZE) {
    return { [name]: value }
  }

  // Chunked exactly as createChunks() does: sequential .0, .1, .2 suffixes.
  const cookies = {}
  let i = 0
  for (let pos = 0; pos < value.length; pos += MAX_CHUNK_SIZE) {
    cookies[`${name}.${i}`] = value.slice(pos, pos + MAX_CHUNK_SIZE)
    i += 1
  }
  if (DEBUG) console.log(`[auth] session split into ${i} cookie chunks`)
  return cookies
}

/**
 * Sign in and install the session into this VU's cookie jar.
 * Returns { session, cookies } or null. Subsequent http calls in the same VU
 * carry the cookies automatically.
 */
export function login(email, password) {
  const session = signIn(email, password)
  if (!session) return null

  const cookies = sessionToCookies(session)
  const jar = http.cookieJar()
  for (const [name, value] of Object.entries(cookies)) {
    // Set on the app origin, not the Supabase origin: the app reads them.
    // BASE_URL from config rather than __ENV directly: config has already
    // stripped a trailing slash, and the jar matches on the URL it is handed.
    //
    // The jar itself is verified to work: a cookie set this way IS returned by
    // cookiesForURL() for both the origin and /api/* paths. What made every
    // authenticated route 401 was the jar being CLEARED between iterations --
    // see noCookiesReset in scenarios/journey.js.
    jar.set(BASE_URL, name, value, { path: '/' })
  }
  return { session, cookies }
}

/** Authorization header for direct PostgREST/GoTrue calls (not app routes). */
export function bearer(session) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
  }
}
