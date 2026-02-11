// Sentry configuration for the browser (client-side).
// Uses @sentry/browser directly for Next.js 16 compatibility.

import * as Sentry from '@sentry/browser'

export function initSentryClient() {
  if (typeof window === 'undefined') return

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Only send errors in production
    enabled: process.env.NODE_ENV === 'production',

    // Sample 100% of errors, 10% of transactions (adjust as traffic grows)
    tracesSampleRate: 0.1,

    // Filter out noise
    ignoreErrors: [
      'ResizeObserver loop',
      'Network request failed',
      'Load failed',
      'AbortError',
    ],
  })
}

export { Sentry }
