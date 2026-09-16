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

/**
 * Delete a slot's auth cookie in this browser.
 *
 * A belt-and-braces companion to signOut(): that call can fail (network, an
 * already-expired token) and it RESOLVES with an { error } rather than
 * throwing, so a caller that only awaits it may navigate away believing the
 * session is gone while the cookie is still there. Since the proxy sends a
 * signed-in admin from /login straight back to /admin, a half-completed
 * sign-out reads as "it logged me back in by itself".
 *
 * Only touches the ONE slot passed in, so signing out of a second account
 * never disturbs the first. Best-effort: the cookie may be Secure or
 * path-scoped in ways document.cookie cannot reach, which is why this
 * supplements signOut() rather than replacing it.
 */
export function clearSlotCookie(slot: number): void {
  if (typeof document === 'undefined') return
  const name = cookieNameForSlot(parseSlot(slot))
  const expiry = 'Thu, 01 Jan 1970 00:00:00 GMT'
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    // @supabase/ssr may shard a large token across name.0, name.1, ...
    // Clear the base name and a few shards; missing ones are harmless no-ops.
    for (const n of [name, `${name}.0`, `${name}.1`, `${name}.2`]) {
      document.cookie = `${n}=; path=/; expires=${expiry}; SameSite=Lax${secure}`
    }
  } catch {
    // Cookies blocked: signOut() above was the real attempt anyway.
  }
}

/**
 * Whether a slot currently holds a session.
 *
 * Judged by its cookie existing with a non-empty value -- INCLUDING the
 * chunked form.
 *
 * @supabase/ssr shards a token larger than 3180 bytes across `name.0`,
 * `name.1`, ... and writes NO cookie under the bare name. An earlier version
 * of this function only matched the bare name, so a slot holding a large
 * token read as FREE, and claimSlotForNewLogin() handed it to a new sign-in
 * that then overwrote a live session. Confirmed by execution, not reading:
 * a jar of `travixo-auth-1.0` + `travixo-auth-1.1` reported slot 1 unoccupied.
 *
 * Matches the same name set clearSlotCookie() removes, so "is it occupied"
 * and "what does signing out delete" can no longer disagree.
 */
export function slotHasSession(slot: number): boolean {
  if (typeof document === 'undefined') return false
  const name = cookieNameForSlot(slot)
  return document.cookie.split('; ').some((c) => {
    const eq = c.indexOf('=')
    if (eq <= 0) return false
    const cookieName = c.slice(0, eq)
    if (c.slice(eq + 1) === '') return false
    if (cookieName === name) return true
    // A chunk of this exact name: `name.0`, `name.1`, ... and NOT `name-1`,
    // which is a different slot that merely shares the prefix.
    const suffix = cookieName.slice(name.length)
    return cookieName.startsWith(name) && /^\.(?:0|[1-9][0-9]*)$/.test(suffix)
  })
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
 * Never returns a slot that holds a session belonging to a tab that is still
 * open, so a new sign-in cannot take over another account's identity.
 *
 * WHEN THE POOL IS FULL
 * ---------------------
 *
 * An earlier version returned null here, and BOTH callers turned that null
 * back into `getCurrentSlot()` -- slot 0 on any bare path. That is the defect
 * observed in production on 2026-09-15: three cookies existed
 * (travixo-auth, -1, -2) with no tab bound to the suffixed two, every slot
 * read as taken, the claim came back null, and the second tab's sign-in
 * overwrote the first tab's cookie. Tab 1 VISIBLY BECAME the other account.
 *
 * Cookies outlive the tabs that made them: a crashed tab, a closed tab, a
 * cleared sessionStorage all leave a cookie with no owner. So "every slot has
 * a cookie" does NOT mean "every slot is in use". Rather than evict slot 0 by
 * default, reclaim the least-recently-usable slot that no OPEN tab claims,
 * and fall back to a slot this browser can prove is stale.
 */
export function claimSlotForNewLogin(): number | null {
  if (typeof window === 'undefined') return DEFAULT_SLOT

  // A tab already pinned to a slot by its URL keeps that slot: the user is
  // re-authenticating that account, not adding another.
  const fromUrl = splitSlotPath(window.location.pathname).slot
  if (fromUrl !== DEFAULT_SLOT) return fromUrl

  const taken = occupiedSlots()

  // Nothing signed in yet: the ordinary single-account case, clean URL.
  if (taken.length === 0) return DEFAULT_SLOT

  // A free slot is always preferred, whether or not this tab holds one.
  const free = listSlots().find((s) => !taken.includes(s))
  if (free !== undefined) return free

  // Every slot holds a cookie. Reclaim one that no open tab is using rather
  // than silently overwriting whichever account happens to sit in slot 0.
  //
  // Two deliberate constraints:
  //
  //   - never this tab's own slot, so signing in here cannot evict the
  //     session this very tab is displaying
  //   - highest slot first, so slot 0 -- the incumbent single-account user,
  //     and the slot every pre-existing tab is on -- is the LAST to go
  //
  // The second matters on the first deploy of this code: tabs opened before
  // it shipped have registered no claim, so they would otherwise look
  // abandoned. Taking the highest slot first means the common case (one old
  // tab on slot 0, orphans above it) reclaims an orphan, not the live session.
  const mine = getCurrentSlot()

  // ZERO CLAIMS ANYWHERE.
  //
  // If NO slot carries a claim, the heartbeat is not running in this browser
  // at all -- the first load after this code deploys, a browser with
  // localStorage unavailable, or every claiming tab already closed. In that
  // state a claim tells us nothing about any slot, so treating the cookies as
  // live tabs would strand the user: every slot full, nothing reclaimable,
  // and a refusal to sign in at all.
  //
  // Absence of evidence is not evidence of occupancy. With no census running,
  // the cookies are exactly what production showed them to be -- orphans. So
  // reclaim the highest slot that is not this tab's.
  const anyClaimExists = listSlots().some((s) => slotClaimTimestamp(s) !== null)

  const reclaimable = [...listSlots()]
    .reverse()
    .find((s) => s !== mine && (!anyClaimExists || !slotIsClaimedByAnOpenTab(s)))
  if (reclaimable !== undefined) {
    clearSlotCookie(reclaimable)
    return reclaimable
  }

  // Every slot other than this tab's is held by a live, claiming tab. There is
  // no slot to give without evicting someone, so the caller must refuse rather
  // than guess -- which is what silently changed a tab's identity before.
  return null
}

/**
 * Whether an OPEN tab in this browser has claimed a slot.
 *
 * Each tab records its slot under a per-slot key in localStorage on mount and
 * removes it on unload, so this is a best-effort census of live tabs. It is
 * deliberately conservative: when the answer is unknown the slot is treated as
 * claimed, so a reclaim never races a tab that is merely slow to register.
 *
 * localStorage is shared across tabs by design here -- that is exactly why it
 * can answer "is any OTHER tab using this slot", which sessionStorage cannot.
 */
export function slotIsClaimedByAnOpenTab(slot: number): boolean {
  const heartbeat = slotClaimTimestamp(slot)
  if (heartbeat === null) return false
  // A tab refreshes its claim on an interval; a claim older than the stale
  // window belonged to a tab that is gone.
  return Date.now() - heartbeat < SLOT_CLAIM_STALE_MS
}

/**
 * This slot's recorded heartbeat, or null when no usable claim exists.
 *
 * Distinct from slotIsClaimedByAnOpenTab() on purpose. "No claim recorded"
 * and "claimed by a live tab" are different facts, and collapsing them is what
 * made a full cookie jar unreclaimable: a browser where the heartbeat has
 * never run would report every slot claimed and refuse every sign-in.
 *
 * Returns null for: storage unavailable, no entry, or an unparseable entry.
 * Callers decide what absence means; this function does not guess.
 */
function slotClaimTimestamp(slot: number): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(slotClaimKey(slot))
    if (!raw) return null
    const heartbeat = Number(raw)
    return Number.isFinite(heartbeat) ? heartbeat : null
  } catch {
    return null
  }
}

/** localStorage key recording that an open tab holds a slot. */
function slotClaimKey(slot: number): string {
  return `travixo.account.claim.${parseSlot(slot)}`
}

/** How long a tab's slot claim stays valid without a refresh. */
const SLOT_CLAIM_STALE_MS = 30_000

/**
 * Register this tab as the live owner of its slot, and keep the claim fresh.
 *
 * Without this, claimSlotForNewLogin() cannot tell a cookie whose tab is still
 * open from one left behind by a closed tab, and a full pool has no safe
 * answer. Installed once from AccountSlotBootstrap.
 *
 * Returns a cleanup function that releases the claim.
 */
export function installSlotClaim(): () => void {
  if (typeof window === 'undefined') return () => {}

  const write = () => {
    try {
      window.localStorage.setItem(slotClaimKey(getCurrentSlot()), String(Date.now()))
    } catch {
      // Storage unavailable: the slot simply reads as unclaimed, which is the
      // conservative direction -- it can be reclaimed, never silently stolen.
    }
  }

  write()
  const timer = window.setInterval(write, SLOT_CLAIM_STALE_MS / 3)

  const release = () => {
    try {
      window.localStorage.removeItem(slotClaimKey(getCurrentSlot()))
    } catch {
      // nothing to do; the claim ages out on its own
    }
  }
  window.addEventListener('pagehide', release)

  return () => {
    window.clearInterval(timer)
    window.removeEventListener('pagehide', release)
    release()
  }
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
