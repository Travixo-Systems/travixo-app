// load/scenarios/login.js
//
// Sign-in.
//
// The login page is entirely client side (app/(auth)/login/page.tsx:73), so
// the app itself does no work: the credential exchange goes straight to
// GoTrue. The app's share of the cost starts on the redirect to /dashboard,
// where proxy.ts:118 validates the session again in middleware.

import { get, readLatency, ok } from '../lib/metrics.js';
import { signIn, sessionCookieHeader, emailForVu, appHeaders } from '../lib/auth.js';
import { BASE_URL, USER_PASSWORD, SUPABASE_ANON_KEY } from '../config.js';

export function loginFlow(vuId) {
  // Cold page load, unauthenticated.
  get('GET /login (doc)', `${BASE_URL}/login`, {
    headers: { Accept: 'text/html', 'Accept-Encoding': 'gzip, br' },
  });

  const email = emailForVu(vuId);
  const started = Date.now();
  const session = signIn(email, USER_PASSWORD);
  readLatency.add(Date.now() - started, { endpoint: 'gotrue token' });

  if (!session) return null;

  const built = {
    email: email,
    accessToken: session.access_token,
    userId: session.user && session.user.id,
    cookie: sessionCookieHeader(session),
    supabaseHeaders: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, br',
    },
  };

  // The post-login redirect. This is the first request that pays for
  // proxy.ts's own auth.getUser().
  const res = get('GET /dashboard (post-login)', `${BASE_URL}/dashboard`, {
    headers: appHeaders(built, { Accept: 'text/html' }),
    redirects: 0,
  });
  ok('GET /dashboard (post-login)', res, [200, 307, 308]);

  return built;
}
