import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import {
  ACCOUNT_SLOT_HEADER,
  DEFAULT_SLOT,
  MAX_ACCOUNT_SLOTS,
  SLOT_STORAGE_KEY,
  cookieNameForSlot,
  cookieOptionsForSlot,
  parseSlot,
  splitSlotPath,
  withSlotPath,
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

  // The URL wins. It is what the browser resends on a reload, so it is the
  // only value guaranteed to agree with what the SERVER just rendered. Reading
  // sessionStorage first would let a restored tab disagree with its own page.
  const fromUrl = splitSlotPath(window.location.pathname).slot
  if (fromUrl !== DEFAULT_SLOT) return fromUrl

  // No prefix in the URL: fall back to this tab's remembered slot. This covers
  // the moment just after the user picks a new slot, before the navigation.
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
    // Storage unavailable: the URL still carries the slot after the caller
    // navigates, and the URL is what actually decides. sessionStorage is only
    // a convenience for the instant between picking a slot and navigating.
  }
  return n
}

/** The URL this tab should navigate to in order to adopt `slot`. */
export function slotUrl(slot: number, pathname?: string): string {
  const base =
    pathname ?? (typeof window === 'undefined' ? '/' : window.location.pathname)
  return withSlotPath(slot, base)
}

/** Whether a slot currently holds a session, judged by its cookie existing. */
export function slotHasSession(slot: number): boolean {
  if (typeof document === 'undefined') return false
  const name = cookieNameForSlot(slot)
  return document.cookie
    .split('; ')
    .some((c) => c.startsWith(`${name}=`) && c.length > name.length + 1)
}

/** Slots that currently hold a session. */
export function occupiedSlots(): number[] {
  return listSlots().filter(slotHasSession)
}

/**
 * Pick the slot a NEW sign-in in this tab should use.
 *
 * This is what makes two accounts work with no UI at all. A tab that is
 * already on an explicit slot keeps it. Otherwise:
 *
 *   - no session anywhere            -> slot 0 (the ordinary single-account
 *                                      case; URL stays clean)
 *   - some other slot already signed
 *     in, and this tab is not one of
 *     them                           -> the first FREE slot
 *
 * So signing in on a second tab automatically lands on its own slot and its
 * own cookie, instead of overwriting the first tab's session. The user does
 * nothing and clicks nothing.
 *
 * Returns null when every slot is taken, so the caller can reuse the current
 * one rather than silently evicting someone.
 */
export function claimSlotForNewLogin(): number | null {
  if (typeof window === 'undefined') return DEFAULT_SLOT

  // A tab already pinned to a slot by its URL keeps that slot: the user is
  // re-authenticating that account, not adding another.
  const fromUrl = splitSlotPath(window.location.pathname).slot
  if (fromUrl !== DEFAULT_SLOT) return fromUrl

  const taken = occupiedSlots()

  // Nothing signed in yet, or this tab's own slot is the one signed in.
  if (taken.length === 0) return DEFAULT_SLOT

  const mine = getCurrentSlot()
  if (taken.includes(mine)) {
    // This tab's slot is already in use. If the browser is signing in again
    // here, treat it as a fresh login for a DIFFERENT account and move to a
    // free slot, so the existing session in this slot is not destroyed.
    const free = listSlots().find((s) => !taken.includes(s))
    return free ?? null
  }

  return mine
}

/**
 * Keep this tab's in-page links pointing at its own slot.
 *
 * The URL is what makes a reload resolve correctly, so a slot-1 tab must stay
 * on /u/1/... as the user navigates. Next's client router rewrites history
 * without a full request, so a plain <Link href="/assets"> would drop the
 * prefix and the NEXT reload would land on slot 0.
 *
 * Rather than rewrite 74 Link hrefs, this intercepts history updates and
 * re-applies the prefix. It is a no-op on slot 0, which is the common case.
 */
export function installSlotHistoryGuard(): void {
  if (typeof window === 'undefined') return
  const w = window as Window & { __travixoSlotHistory?: boolean }
  if (w.__travixoSlotHistory) return
  w.__travixoSlotHistory = true

  const fix = (url: string | URL | null | undefined): string | URL | null | undefined => {
    const slot = getCurrentSlot()
    if (slot === 0 || url === null || url === undefined) return url
    try {
      const u = new URL(String(url), window.location.href)
      if (u.origin !== window.location.origin) return url
      const next = withSlotPath(slot, u.pathname)
      if (next === u.pathname) return url
      u.pathname = next
      return u.pathname + u.search + u.hash
    } catch {
      return url
    }
  }

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history)
    history[method] = (data: unknown, unused: string, url?: string | URL | null) =>
      original(data, unused, fix(url) as string | URL | null | undefined)
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
