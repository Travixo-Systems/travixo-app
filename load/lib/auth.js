// load/lib/auth.js
//
// Reproduces the browser's authenticated state without a browser.
//
// The app has no server-side login endpoint: app/(auth)/login/page.tsx:73
// calls supabase.auth.signInWithPassword(), which posts straight to GoTrue.
// The session is then persisted by @supabase/ssr's browser client into a
// cookie that lib/supabase/server.ts and proxy.ts read back.
//
// Cookie format, verified against the installed packages rather than docs:
//   name      sb-<project-ref>-auth-token
//             (@supabase/supabase-js dist/index.mjs:206,
//              `sb-${baseUrl.hostname.split(".")[0]}-auth-token`)
//   value     "base64-" + base64url(JSON.stringify(session))
//             (@supabase/ssr dist/main/cookies.js:7,310 - BASE64_PREFIX,
//              cookieEncoding defaults to "base64url" in createBrowserClient.js:21)
//   chunking  split at 3180 chars of the URI-encoded value into
//             <name>.0, <name>.1, ... (@supabase/ssr utils/chunker.js:8,23)
//   base64url alphabet has no padding (utils/base64url.js:17)

import http from 'k6/http';
import encoding from 'k6/encoding';
import { fail } from 'k6';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  USER_EMAIL_PATTERN,
  USER_PASSWORD,
  USER_COUNT,
  DEBUG,
} from '../config.js';

const MAX_CHUNK_SIZE = 3180;

export function projectRef(supabaseUrl) {
  // https://<ref>.supabase.co -> <ref>
  const withoutScheme = supabaseUrl.replace(/^https?:\/\//, '');
  return withoutScheme.split('/')[0].split(':')[0].split('.')[0];
}

export function storageKey(supabaseUrl) {
  return `sb-${projectRef(supabaseUrl)}-auth-token`;
}

// Mirrors @supabase/ssr createChunks(). We only need the simple path: the
// session JSON is ASCII-safe after base64url encoding, so no multi-byte
// boundary handling is required here.
function createChunks(key, value) {
  const encoded = encodeURIComponent(value);
  if (encoded.length <= MAX_CHUNK_SIZE) {
    return [{ name: key, value: value }];
  }
  const chunks = [];
  let rest = value;
  let i = 0;
  while (rest.length > 0) {
    // base64url output is single-byte per character, so encodeURIComponent
    // expands nothing except "-" and "_" (which it leaves alone). Slicing the
    // raw value at MAX_CHUNK_SIZE is therefore safe and matches the library.
    const head = rest.slice(0, MAX_CHUNK_SIZE);
    chunks.push({ name: `${key}.${i}`, value: head });
    rest = rest.slice(head.length);
    i += 1;
  }
  return chunks;
}

export function emailForVu(vuId) {
  const index = ((vuId - 1) % USER_COUNT) + 1;
  return USER_EMAIL_PATTERN.replace('{i}', String(index));
}

/**
 * Sign in against GoTrue. Returns the raw session object, or null on failure.
 * Tagged so login latency is measurable on its own.
 */
export function signIn(email, password) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    fail('SUPABASE_URL and SUPABASE_ANON_KEY are required. See load/README.md.');
  }

  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: email, password: password }),
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      tags: { name: 'gotrue token', op: 'login', class: 'read' },
    }
  );

  if (res.status !== 200) {
    if (DEBUG) console.error(`login failed for ${email}: ${res.status} ${res.body}`);
    return null;
  }

  let session;
  try {
    session = JSON.parse(res.body);
  } catch (_) {
    return null;
  }
  if (!session || !session.access_token) return null;

  // GoTrue returns expires_in; the client derives expires_at before storing.
  if (!session.expires_at && session.expires_in) {
    session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  }
  return session;
}

/**
 * Build the Cookie header value the Next app expects for this session.
 */
export function sessionCookieHeader(session) {
  const key = storageKey(SUPABASE_URL);
  const value = 'base64-' + encoding.b64encode(JSON.stringify(session), 'rawurl');
  const chunks = createChunks(key, value);
  return chunks.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Everything a scenario needs to act as one signed-in user.
 */
export function authenticate(vuId) {
  const email = emailForVu(vuId);
  if (!USER_PASSWORD) {
    fail('USER_PASSWORD is required. See load/README.md.');
  }
  const session = signIn(email, USER_PASSWORD);
  if (!session) return null;

  return {
    email: email,
    accessToken: session.access_token,
    userId: session.user && session.user.id,
    cookie: sessionCookieHeader(session),
    // For calls that go straight to PostgREST the way the client components do
    // (components/assets/AssetsPageClient.tsx:86 and friends).
    supabaseHeaders: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, br',
    },
  };
}

/**
 * Headers for a request to the Next app as this signed-in user.
 * `origin` is required: proxy.ts:57 rejects mutating requests whose Origin
 * does not match the app's own (lib/security/csrf.ts:56).
 */
export function appHeaders(session, extra) {
  const base = {
    Cookie: session ? session.cookie : '',
    'Accept-Encoding': 'gzip, br',
    Accept: 'application/json',
  };
  return Object.assign(base, extra || {});
}
