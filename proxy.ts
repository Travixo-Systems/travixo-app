// proxy.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'
import { rateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'
import { validateCsrf } from '@/lib/security/csrf'
import {
  ACCOUNT_SLOT_HEADER,
  RESOLVED_SLOT_HEADER,
  cookieOptionsForSlot,
  parseSlot,
  splitSlotPath,
  withSlotPath,
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
  // Strip the account-slot prefix FIRST, so every check below -- rate
  // limiting, protected-route matching, the login redirect -- sees the real
  // application path. /u/1/dashboard must be treated as /dashboard in every
  // respect except which auth cookie is read.
  const rawPathname = request.nextUrl.pathname
  const { slot: urlSlot, path: pathname } = splitSlotPath(rawPathname)
  const hasSlotPrefix = pathname !== rawPathname
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
  // Resolution order, and why:
  //
  //   1. the URL prefix  (/u/1/dashboard)  -- authoritative
  //   2. the request header (fetch only)   -- for same-page API calls
  //
  // The URL comes FIRST because it is the only per-tab channel the browser
  // resends on a RELOAD. An earlier version used a browser-wide hint cookie
  // here, and it caused the bug this replaces: after reloading, two tabs on
  // different accounts both showed whichever account signed in last, because
  // one shared cookie cannot answer a per-tab question.
  //
  // The header still matters: a fetch() from a slot-1 page may target a plain
  // /api/... URL with no prefix, and installAccountSlotFetch attaches the
  // slot to those. It is only consulted when the URL carries no prefix.
  //
  // Both go through parseSlot(), so neither can widen the reachable cookie set.
  const headerSlot = request.headers.get(ACCOUNT_SLOT_HEADER)
  const slot =
    hasSlotPrefix
      ? urlSlot
      : headerSlot !== null
        ? parseSlot(headerSlot)
        : 0
  const slotCookieOptions = cookieOptionsForSlot(slot)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(RESOLVED_SLOT_HEADER, String(slot))

  // Build the pass-through response.
  //
  // When the URL carries a slot prefix we REWRITE to the stripped path, so
  // /u/1/dashboard is served by the /dashboard route. The browser keeps
  // showing /u/1/dashboard -- which is the whole point, since that is what it
  // will resend on reload -- while the application never sees the prefix. No
  // route, Link, redirect or API path in the app changes.
  //
  // Defined as a function because the Supabase cookie callbacks rebuild the
  // response when a token refreshes; all rebuilds must make the same choice,
  // or a refresh would drop the rewrite and 404.
  const passThrough = () => {
    if (!hasSlotPrefix) {
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = pathname // the stripped, real path
    return NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    })
  }

  // --- Supabase Auth ---
  let response = passThrough()

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
          response = passThrough()
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
          response = passThrough()
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Define protected routes (all routes except public ones)
  //
  // /admin is here for TWO reasons. It is gated server-side by
  // requireSuperAdmin() in the admin layout, so it was never open -- but a
  // route that skips the proxy also skips slot resolution, and
  // lib/supabase/server.ts then falls back to slot 0. That made /admin always
  // read the FIRST account's cookie no matter which tab it was opened in,
  // overriding the tab's real session.
  const protectedRoutes = [
    '/dashboard',
    '/assets',
    '/vgp',
    '/subscription',
    '/settings',
    '/team',
    '/audits',
    '/admin',
  ]

  // Check if current path is protected
  const isProtectedRoute = protectedRoutes.some(route =>
    pathname.startsWith(route)
  )

  // Auth pages need the session too, to bounce a signed-in visitor away from
  // /login and /signup. Everything else matched here -- /scan/* above all --
  // is public and must not pay for a session lookup.
  const isAuthPage = pathname === '/login' || pathname === '/signup'

  // getUser() is a NETWORK call to GoTrue, not a local token decode. Calling it
  // unconditionally meant every anonymous QR scan blocked on Supabase Auth
  // before any HTML was produced, on the one route most likely to be opened on
  // a phone with bad signal. Only routes whose behaviour depends on identity
  // resolve one.
  const needsSession = isProtectedRoute || isAuthPage
  const user = needsSession
    ? (await supabase.auth.getUser()).data.user
    : null

  // Redirect unauthenticated users trying to access protected routes.
  //
  // Both the /login target and the redirectTo value keep this tab's slot
  // prefix. Without that, signing in from a slot-1 tab would land back on
  // slot 0 and the tab would silently change account.
  if (!user && isProtectedRoute) {
    const redirectUrl = new URL(withSlotPath(slot, '/login'), request.url)
    redirectUrl.searchParams.set('redirectTo', withSlotPath(slot, pathname))
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect authenticated users away from auth pages. Platform admins
  // (members of platform_admins, checked via is_super_admin()) go to /admin
  // instead of the tenant dashboard.
  if (user && (pathname === '/login' || pathname === '/signup')) {
    let destination = '/dashboard'
    const { data: isAdmin } = await supabase.rpc('is_super_admin')
    if (isAdmin === true) destination = '/admin'
    return NextResponse.redirect(
      new URL(withSlotPath(slot, destination), request.url)
    )
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
    // /admin must run through the proxy like every other authenticated route.
    // Omitting it meant no slot was resolved for it, so it always fell back to
    // slot 0 and showed the first account regardless of the tab.
    '/admin',
    '/admin/:path*',
    '/login',
    '/signup',
    // Account-slot URLs (/u/1/dashboard, ...). The proxy MUST run for these:
    // it is what strips the prefix and rewrites to the real route. Without
    // this entry the prefixed URLs would bypass the proxy entirely and 404.
    // One broad entry rather than a prefixed copy of every route above, so a
    // route added later cannot be forgotten here.
    '/u/:slot/:path*',
    '/u/:slot',
  ],
}
