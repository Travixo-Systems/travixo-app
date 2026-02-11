// In-memory sliding window rate limiter for Next.js middleware (Edge Runtime compatible).
// For production at scale, swap the Map for Redis (e.g. @upstash/ratelimit).

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Periodic cleanup to prevent memory leaks (runs at most once per minute)
let lastCleanup = 0
function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key)
  }
}

export interface RateLimitConfig {
  /** Max requests in the window */
  limit: number
  /** Window size in seconds */
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

/**
 * Check rate limit for a given key.
 * Returns whether the request is allowed and relevant headers.
 */
export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  cleanup()

  const now = Date.now()
  const windowMs = config.windowSeconds * 1000
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    // New window
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, limit: config.limit, remaining: config.limit - 1, resetAt: now + windowMs }
  }

  entry.count++

  if (entry.count > config.limit) {
    return { allowed: false, limit: config.limit, remaining: 0, resetAt: entry.resetAt }
  }

  return { allowed: true, limit: config.limit, remaining: config.limit - entry.count, resetAt: entry.resetAt }
}

// Preset configurations for different endpoint categories
export const RATE_LIMITS = {
  /** Auth endpoints (login, signup, password reset) — strict */
  auth: { limit: 10, windowSeconds: 60 } satisfies RateLimitConfig,

  /** Password change — very strict */
  password: { limit: 5, windowSeconds: 300 } satisfies RateLimitConfig,

  /** General API — standard */
  api: { limit: 100, windowSeconds: 60 } satisfies RateLimitConfig,

  /** Webhooks (Stripe, etc.) — lenient */
  webhook: { limit: 200, windowSeconds: 60 } satisfies RateLimitConfig,
} as const
