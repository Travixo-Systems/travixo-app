import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import {
  ACCOUNT_SLOT_HEADER,
  DEFAULT_SLOT,
  MAX_ACCOUNT_SLOTS,
  SLOT_HINT_COOKIE,
  SLOT_STORAGE_KEY,
  cookieOptionsForSlot,
  parseSlot,
} from './account-slot'

/**
 * This tab's account slot.
 *
 * sessionStorage is per-TAB by construction, which is the entire point:
 * localStorage and cookies are shared across tabs and would put every tab back
 * on one identity. Reads defensively -- private mode and blocked site data
 * make sessionStorage throw rather than return null.
 */
export function getCurrentSlot(): number {
  if (typeof window === 'undefined') return DEFAULT_SLOT
  try {
    return parseSlot(window.sessionStorage.getItem(SLOT_STORAGE_KEY))
  } catch {
    return DEFAULT_SLOT
  }
}

/**
 * Point this tab at a different account slot.
 *
 * Only changes which cookie this tab reads; it does not sign anyone in or
 * out. After switching, the tab is signed out iff that slot has no session,
 * which is what sends the user to /login to add a second account.
 */
export function setCurrentSlot(slot: number): number {
  const n = parseSlot(slot)
  if (typeof window === 'undefined') return n
  try {
    window.sessionStorage.setItem(SLOT_STORAGE_KEY, String(n))
  } catch {
    // Storage unavailable: the tab stays on whatever it had. Callers reload
    // afterwards, so a silent no-op degrades to "switch did not take".
  }
  publishSlotHint(n)
  return n
}

/**
 * Write this tab's slot into the hint cookie the proxy reads for plain
 * navigations (a link click carries no custom header).
 *
 * The cookie is per-browser, so the LAST tab to publish wins. That is why the
 * active tab republishes on mount and on focus: the tab the user is looking
 * at is the one whose navigations must resolve correctly.
 *
 * SameSite=Lax so it rides along with top-level navigations, which is exactly
 * the case it exists for. Not HttpOnly by necessity -- client script owns it.
 * It carries no credential, only which cookie NAME to read; the session token
 * itself stays in its own cookie.
 */
export function publishSlotHint(slot: number): void {
  if (typeof document === 'undefined') return
  const n = parseSlot(slot)
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${SLOT_HINT_COOKIE}=${n}; path=/; SameSite=Lax${secure}`
  } catch {
    // Cookies blocked: navigations fall back to slot 0. fetch() still carries
    // the header, so data requests stay correct.
  }
}

/** Every slot, for a switcher UI. */
export function listSlots(): number[] {
  return Array.from({ length: MAX_ACCOUNT_SLOTS }, (_, i) => i)
}

// This creates a Supabase client for use in Client Components (browser)
//
// The auth cookie name comes from THIS TAB's slot, so two tabs on different
// slots read two different cookies and hold two different sessions.
// See lib/supabase/account-slot.ts.
//
// isSingleton: false is REQUIRED, not a preference. @supabase/ssr keeps ONE
// client in a module-level `cachedBrowserClient` and returns it for every
// later call, ignoring the options passed. Under that default the FIRST
// createClient() on the page would freeze the tab onto that slot's cookie and
// switching accounts would silently keep using the old session.
//
// But we cannot simply build a new client every call either: this repo calls
// createClient() during render in dozens of components, and a fresh client per
// render would churn auth listeners and refresh timers. So we keep our OWN
// cache, keyed by slot — one stable client per slot, and a switch picks up a
// different one.
const clientsBySlot = new Map<number, ReturnType<typeof createBrowserClient<Database>>>()

export function createClient() {
  const slot = getCurrentSlot()
  const existing = clientsBySlot.get(slot)
  if (existing) return existing

  const client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      isSingleton: false,
      cookieOptions: cookieOptionsForSlot(slot),
    }
  )
  clientsBySlot.set(slot, client)
  return client
}

/**
 * Make every same-origin request carry this tab's slot.
 *
 * Installed once from a root client component. Wrapping fetch is deliberate:
 * this repo has 35 hand-written fetch('/api/...') call sites, and editing each
 * one is 35 chances to miss one -- a miss would silently send that request to
 * the wrong account. One wrapper covers all of them, including any added later.
 *
 * Cross-origin requests are left completely untouched: adding a custom header
 * to them would trigger CORS preflights and leak the slot to third parties.
 *
 * Idempotent -- safe under React strict-mode double-invocation and fast
 * refresh, which would otherwise wrap the wrapper.
 */
export function installAccountSlotFetch(): void {
  if (typeof window === 'undefined') return
  const w = window as Window & { __travixoSlotFetch?: boolean }
  if (w.__travixoSlotFetch) return
  w.__travixoSlotFetch = true

  const original = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let sameOrigin = false
    try {
      const url =
        typeof input === 'string'
          ? new URL(input, window.location.href)
          : input instanceof URL
            ? input
            : new URL((input as Request).url, window.location.href)
      sameOrigin = url.origin === window.location.origin
    } catch {
      sameOrigin = false
    }

    if (!sameOrigin) return original(input, init)

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(ACCOUNT_SLOT_HEADER, String(getCurrentSlot()))
    return original(input, { ...init, headers })
  }
}
