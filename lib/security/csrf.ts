// CSRF protection via Origin header verification.
// For cookie-authenticated SPAs, verifying the Origin (or Referer) header
// against the app's own domain is the OWASP-recommended approach.
// See: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

import { NextRequest } from 'next/server'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Paths that are exempt from CSRF checks because they use
 * their own authentication (webhook signatures, bearer tokens, etc.)
 */
const EXEMPT_PATHS = [
  '/api/stripe/webhook',   // Stripe signature verification
  '/api/cron/',            // Bearer token auth
  '/api/uploadthing',      // UploadThing SDK handles its own auth
]

/**
 * Validate that a mutating request originates from our own domain.
 * Returns null if the request is allowed, or an error message if blocked.
 */
export function validateCsrf(request: NextRequest): string | null {
  // Only check mutating methods
  if (!MUTATING_METHODS.has(request.method)) return null

  // Skip exempt paths
  const pathname = request.nextUrl.pathname
  if (EXEMPT_PATHS.some(p => pathname.startsWith(p))) return null

  const origin = request.headers.get('origin')

  // If there's no origin header, check referer as fallback
  // (Some older browsers omit origin on same-origin requests)
  if (!origin) {
    const referer = request.headers.get('referer')
    if (!referer) {
      // Requests with no origin AND no referer are suspicious for mutating methods
      // Exception: server-to-server calls won't have these headers,
      // but those should use bearer tokens, not cookies
      return 'Missing origin header'
    }
    try {
      const refererUrl = new URL(referer)
      if (refererUrl.origin !== request.nextUrl.origin) {
        return 'Referer origin mismatch'
      }
    } catch {
      return 'Invalid referer header'
    }
    return null
  }

  // Standard origin check
  if (origin !== request.nextUrl.origin) {
    return 'Origin mismatch'
  }

  return null
}
