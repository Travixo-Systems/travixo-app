// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'
import { rateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'
import { validateCsrf } from '@/lib/security/csrf'

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function getRateLimitConfig(pathname: string) {
  if (pathname.startsWith('/api/stripe/webhook')) return RATE_LIMITS.webhook
  if (pathname.startsWith('/api/settings/profile/password')) return RATE_LIMITS.password
  if (pathname === '/login' || pathname === '/signup') return RATE_LIMITS.auth
  if (pathname.startsWith('/api/')) return RATE_LIMITS.api
  return null
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const ip = getClientIp(request)

  // --- Rate Limiting ---
  const rlConfig = getRateLimitConfig(pathname)
  if (rlConfig) {
    const key = `${ip}:${pathname}`
    const result = rateLimit(key, rlConfig)
    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.resetAt),
          },
        }
      )
    }
  }

  // --- CSRF Protection ---
  const csrfError = validateCsrf(request)
  if (csrfError) {
    return NextResponse.json(
      { error: 'CSRF validation failed' },
      { status: 403 }
    )
  }

  // --- Supabase Auth ---
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Define protected routes (all routes except public ones)
  const protectedRoutes = [
    '/dashboard',
    '/assets',
    '/vgp',
    '/subscription',
    '/settings',
    '/team',
    '/audits',
  ]

  // Check if current path is protected
  const isProtectedRoute = protectedRoutes.some(route =>
    pathname.startsWith(route)
  )

  // Redirect unauthenticated users trying to access protected routes
  if (!user && isProtectedRoute) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/assets/:path*',
    '/audits/:path*',
    '/team/:path*',
    '/settings/:path*',
    '/vgp/:path*',
    '/subscription/:path*',
    '/api/:path*',
    '/login',
    '/signup'
  ],
}
