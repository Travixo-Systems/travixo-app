'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Dynamic import to avoid SSR issues with @sentry/browser
    import('@sentry/browser').then(Sentry => {
      Sentry.captureException(error)
    })
  }, [error])

  return (
    <html>
      <body>
        <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '1rem' }}>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: '#1e3a5f',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
