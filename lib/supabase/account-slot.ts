// lib/supabase/account-slot.ts
// Per-TAB account identity. The mechanism that lets two different accounts
// be signed in at the same time in one browser.
//
// ---------------------------------------------------------------------------
// THE PROBLEM
// ---------------------------------------------------------------------------
//
// A cookie is keyed by (name, domain). One name holds exactly one session. So
// with a single pinned cookie name -- which is what Phase 1 gave us -- signing
// in as B in a second tab overwrites A's token in the SAME cookie, and tab A
// silently becomes account B on its next request.
//
// Phase 1 stopped sign-out in one tab from destroying the others. It did NOT
// make two DIFFERENT accounts possible at once, and a prospect comparing their
// own data against a demo account needs exactly that.
//
// ---------------------------------------------------------------------------
// THE MECHANISM
// ---------------------------------------------------------------------------
//
// Give each TAB a slot number, and give each slot its OWN cookie name:
//
//   slot 0  ->  travixo-auth          (the Phase 1 name; see COMPATIBILITY)
//   slot 1  ->  travixo-auth-1
//   slot 2  ->  travixo-auth-2
//
// Different names are different cookies, so the sessions genuinely coexist.
// The browser sends its slot as a request header; proxy.ts resolves it and
// forwards it to Server Components, so client and server agree on which
// cookie to read for THIS request.
//
// The slot lives in sessionStorage, which is per-tab by construction --
// localStorage and cookies are per-browser and would defeat the whole point.
//
// ---------------------------------------------------------------------------
// WHY NOT A PATH PREFIX
// ---------------------------------------------------------------------------
//
// The textbook answer is to put the account in the URL (/a/<slug>/dashboard).
// Measured against THIS repo that means touching ~150 call sites: 74 Link
// hrefs, 36 router.push/replace, 5 redirect(), 35 fetch('/api/...'). Every one
// is a chance to leak the wrong account into a link. The header approach needs
// zero routing changes, so no existing URL, link, or redirect moves.
//
// The trade-off is honest: a URL is shareable and survives a cold tab open;
// a header is not and does not. A NEW tab (Ctrl+T, or a link opened in a new
// tab) starts empty and therefore lands on slot 0. That is the right default
// -- most people have one account -- and switching is explicit.
//
// ---------------------------------------------------------------------------
// COMPATIBILITY
// ---------------------------------------------------------------------------
//
// Slot 0 MUST keep the exact Phase 1 cookie name. Anyone signed in right now
// holds that cookie; renaming it would sign the whole userbase out a second
// time. Slot 0 is also what any request without a slot header resolves to, so
// server-rendered requests, curl, and old tabs all keep working untouched.

import { AUTH_COOKIE_NAME } from './cookie-name'

/**
 * How many accounts one browser may hold at once.
 *
 * Bounded on purpose. The slot travels in a client-controlled header, so an
 * unbounded value would let a caller mint arbitrary cookie names and fill the
 * cookie jar. Three covers the real case (your account + a demo + one more)
 * without turning the header into a free-form key.
 */
export const MAX_ACCOUNT_SLOTS = 3

/** The slot used when no valid slot is supplied. Keeps the Phase 1 cookie. */
export const DEFAULT_SLOT = 0

/** The request header a tab uses to declare its slot. */
export const ACCOUNT_SLOT_HEADER = 'x-travixo-account'

/**
 * Header the proxy uses to hand the RESOLVED slot to Server Components.
 *
 * Deliberately different from ACCOUNT_SLOT_HEADER. The inbound header is
 * attacker-controlled; this one is written by the proxy AFTER validation, so a
 * Server Component reading it gets a value that has already been through
 * parseSlot(). Never trust the inbound header server-side; read this one.
 */
export const RESOLVED_SLOT_HEADER = 'x-travixo-account-resolved'

/** sessionStorage key holding this tab's slot. Per-tab, never per-browser. */
export const SLOT_STORAGE_KEY = 'travixo.account.slot'

/**
 * Cookie carrying the slot for plain NAVIGATIONS.
 *
 * The header covers fetch(), but a link click or a typed URL is a browser
 * navigation and sends no custom header -- the server would fall back to slot
 * 0 and render the wrong account for a tab that had switched.
 *
 * A cookie is per-BROWSER, not per-tab, so this alone cannot be the source of
 * truth (both tabs would share it). It is used as a HINT and is rewritten by
 * the active tab on every navigation and on focus, so it always reflects the
 * tab the user is actually looking at. The per-tab sessionStorage value stays
 * authoritative for fetch(), and a tab that finds the hint disagreeing with
 * its own slot corrects it.
 *
 * The trade-off, stated plainly: with two tabs on different slots, a plain
 * navigation in the background tab can briefly render the foreground tab's
 * account until that tab's own script corrects it. Data fetches never do
 * this, because they carry the header.
 */
export const SLOT_HINT_COOKIE = 'travixo-slot'

/**
 * Coerce anything into a valid slot number.
 *
 * This is the ONLY way a slot may enter the system. It is total: every input,
 * including hostile ones, maps to an integer in [0, MAX_ACCOUNT_SLOTS-1].
 * Rejects floats, negatives, out-of-range values, '1e3', '0x2', whitespace
 * padding, and anything non-numeric. There is no path from a header value to
 * an arbitrary cookie name.
 */
export function parseSlot(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return DEFAULT_SLOT

  // Only a plain run of ASCII digits is acceptable. This rejects '1e3',
  // '0x2', '+1', ' 1', '1.0' and similar before any numeric coercion.
  const s = typeof raw === 'number' ? String(raw) : raw
  if (typeof s !== 'string' || !/^\d+$/.test(s)) return DEFAULT_SLOT

  const n = Number(s)
  if (!Number.isInteger(n) || n < 0 || n >= MAX_ACCOUNT_SLOTS) return DEFAULT_SLOT
  return n
}

/**
 * The auth cookie name for a slot.
 *
 * Slot 0 returns the bare Phase 1 name so existing sessions survive; other
 * slots get a suffixed name. The argument is run through parseSlot() again
 * rather than trusted, so this function is safe even if a caller forgets.
 */
export function cookieNameForSlot(slot: string | number | null | undefined): string {
  const n = parseSlot(slot)
  return n === DEFAULT_SLOT ? AUTH_COOKIE_NAME : `${AUTH_COOKIE_NAME}-${n}`
}

/** Cookie options for a slot, for handing to createServerClient/createBrowserClient. */
export function cookieOptionsForSlot(
  slot: string | number | null | undefined
): { name: string } {
  return { name: cookieNameForSlot(slot) }
}

/** Every cookie name this scheme can produce. Used by tests and sign-out-all. */
export function allSlotCookieNames(): string[] {
  return Array.from({ length: MAX_ACCOUNT_SLOTS }, (_, i) => cookieNameForSlot(i))
}

/** Display label for a slot, for the switcher UI. */
export function slotLabel(slot: number): string {
  const n = parseSlot(slot)
  return n === DEFAULT_SLOT ? 'Account 1' : `Account ${n + 1}`
}
