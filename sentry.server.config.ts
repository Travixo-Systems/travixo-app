// Sentry configuration for the server (API routes, SSR).
// Uses @sentry/node directly for Next.js 16 compatibility.

import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only send errors in production
  enabled: process.env.NODE_ENV === 'production',

  // Sample 100% of errors, 10% of transactions
  tracesSampleRate: 0.1,
})

export { Sentry }
