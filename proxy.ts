// proxy.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'
import { rateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'
import { validateCsrf } from '@/lib/security/csrf'
import {
  ACCOUNT_SLOT_HEADER,
  RESOLVED_SLOT_HEADER,
  SLOT_HINT_COOKIE,
  cookieOptionsForSlot,
  parseSlot,
} from '@/lib/supabase/account-slot'

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
  if (pathname.startsWith('/api/cron/')) return RATE_LIMITS.cron
  if (pathname.startsWith('/api/')) return RATE_LIMITS.api
  if (pathname.startsWith('/scan/')) return RATE_LIMITS.scan
  return null
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const ip = getClientIp(request)

  // --- Rate Limiting ---
  const rlConfig = getRateLimitConfig(pathname)
  if (rlConfig) {
    // Collapse all /scan/<qr_code> variants into one bucket per IP so
    // attackers can't enumerate assets by cycling through unique QR codes
    const key = pathname.startsWith('/scan/')
      ? `${ip}:/scan`
      : `${ip}:${pathname}`
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

  // --- Per-tab account slot ---
  //
  // A tab declares which of its accounts this request belongs to via
  // ACCOUNT_SLOT_HEADER. The value is client-controlled, so parseSlot()
  // bounds it to [0, MAX_ACCOUNT_SLOTS) -- anything else becomes slot 0.
  // Slot 0 keeps the original cookie name, so a request with no header (a
  // plain navigation, an old tab, curl) behaves exactly as before.
  //
  // The RESOLVED value is forwarded to Server Components on a DIFFERENT
  // header, so server-side code reads a value that has already been
  // validated here rather than trusting the inbound one.
  //
  // The header is authoritative because it is per-tab. It is present on
  // fetch() (installAccountSlotFetch wraps them all) but NOT on a plain
  // navigation, which no script mediates. For those, fall back to the
  // SLOT_HINT_COOKIE the active tab keeps up to date. Both go through
  // parseSlot(), so neither can widen the set of reachable cookie names.
  const headerSlot = request.headers.get(ACCOUNT_SLOT_HEADER)
  const slot =
    headerSlot !== null
      ? parseSlot(headerSlot)
      : parseSlot(request.cookies.get(SLOT_HINT_COOKIE)?.value)
  const slotCookieOptions = cookieOptionsForSlot(slot)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(RESOLVED_SLOT_HEADER, String(slot))

  // --- Supabase Auth ---
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Resolved per request from the tab's slot, so two tabs on different
      // slots read two different cookies and hold two different sessions.
      // The proxy decides who is signed in for EVERY protected route, so a
      // mismatch here logs the whole app out. See lib/supabase/account-slot.ts.
      cookieOptions: slotCookieOptions,
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
              headers: requestHeaders,
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
              headers: requestHeaders,
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

  // Redirect authenticated users away from auth pages. Platform admins
  // (members of platform_admins, checked via is_super_admin()) go to /admin
  // instead of the tenant dashboard.
  if (user && (pathname === '/login' || pathname === '/signup')) {
    let destination = '/dashboard'
    const { data: isAdmin } = await supabase.rpc('is_super_admin')
    if (isAdmin === true) destination = '/admin'
    return NextResponse.redirect(new URL(destination, request.url))
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
    '/scan/:path*',
    '/login',
    '/signup'
  ],
}
