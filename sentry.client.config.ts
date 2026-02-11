// Sentry configuration for the browser (client-side).
// Loaded automatically by @sentry/nextjs via next.config.ts instrumentation.

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only send errors in production
  enabled: process.env.NODE_ENV === 'production',

  // Sample 100% of errors, 10% of transactions (adjust as traffic grows)
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // Filter out noise
  ignoreErrors: [
    'ResizeObserver loop',
    'Network request failed',
    'Load failed',
    'AbortError',
  ],
})
