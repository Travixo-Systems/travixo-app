// lib/supabase/cookie-name.ts
// The ONE place the auth cookie is named, and the ONE place sign-out scope
// is decided.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
// ---------------------------------------------------------------------------
//
// Two separate defaults in @supabase/ssr + @supabase/auth-js combined to make
// a second browser tab unusable:
//
// 1. COOKIE NAME. createBrowserClient/createServerClient derive the auth
//    cookie name from the project ref: `sb-<ref>-auth-token`. That name is a
//    constant per project, not per user and not per tab. Signing in as B in a
//    second tab overwrites A's token in the SAME cookie, so tab A silently
//    BECOMES account B on its next request. It does not error -- it changes
//    identity, which is worse.
//
// 2. SIGN-OUT SCOPE. auth-js declares `signOut(options = { scope: 'global' })`
//    (verified in node_modules/@supabase/auth-js/dist/module/GoTrueClient.js).
//    'global' revokes the user's refresh token SERVER-SIDE, killing every
//    session that user has anywhere -- other tabs, other browsers, their
//    phone. Every signOut() in this app was a bare call, so every sign-out
//    was a global one.
//
// Defect 2 is what makes evaluation impossible: a prospect opens two tabs,
// signs out of one, and the other dies. This module fixes that by making the
// scope explicit everywhere, and pins the cookie name so the app owns its own
// session identity instead of inheriting a library default.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE ALONE DOES NOT DO  (see account-slot.ts)
// ---------------------------------------------------------------------------
//
// On its own, this file does NOT let two DIFFERENT accounts be signed in at
// the same time. Cookies are keyed by name and domain, so ONE name holds ONE
// session -- a second sign-in overwrites the first.
//
// That is what lib/supabase/account-slot.ts adds: it gives each browser TAB a
// slot, and each slot its own cookie name derived from AUTH_COOKIE_NAME below.
// AUTH_COOKIE_NAME is therefore the name of SLOT 0 specifically, not the only
// name the app uses. Slot 0 keeps this exact value so that adding the slot
// scheme did not sign existing users out.
//
// Read this file for "what the cookie is called and how sign-out is scoped".
// Read account-slot.ts for "how two accounts coexist".

/**
 * The auth cookie name.
 *
 * Pinned rather than inherited so that the name is a decision this repo owns.
 * Changing this value signs everyone out once (their old cookie is orphaned),
 * so treat it as a one-time migration, not a knob.
 */
export const AUTH_COOKIE_NAME = 'travixo-auth'

/**
 * Cookie options shared by EVERY Supabase client in the app.
 *
 * Every construction site must spread this. A single client left on the
 * library default would read a different cookie than the rest of the app and
 * present the user as signed out on exactly those routes.
 */
export const AUTH_COOKIE_OPTIONS = {
  name: AUTH_COOKIE_NAME,
} as const

/**
 * Sign-out scope for a normal "log out of this browser" action.
 *
 * 'local' clears THIS browser's stored session and leaves the user's other
 * sessions alone. This is what a user means by "log out" and what every
 * sign-out button in this app should pass.
 *
 * Use 'global' ONLY for a deliberate "sign out everywhere" control (a
 * security action after a password change or a suspected compromise). It is
 * never the right default: it is the reason a sign-out in one tab used to end
 * the session in every other tab.
 */
export const SIGN_OUT_SCOPE_LOCAL = { scope: 'local' } as const

/** Explicit "end every session for this user, everywhere". Security use only. */
export const SIGN_OUT_SCOPE_GLOBAL = { scope: 'global' } as const
