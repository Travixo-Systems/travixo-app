// lib/admin/lastConnected.ts
// Server-only: reads sign-in times out of auth.users for the admin screens.
//
// WHY THIS IS NOT A DATABASE QUERY
//
// public.users has no last-login column. The real value is
// auth.users.last_sign_in_at, which lives in the `auth` schema and is not
// exposed through PostgREST, so `supabase.from('users')` cannot reach it.
// The Auth admin API can, with the service-role key.
//
// The alternative -- adding users.last_seen_at and a write on every
// request -- means a column, a migration, a write on the hot path, and a
// second source of truth that can drift from auth.users. Reading the value
// Supabase already maintains is strictly less machinery.
//
// COST
//
// listUsers() is paginated over ALL auth users, not filtered by org. That
// is fine at the current scale (the admin org list already loads every
// org, user, and asset row) but it is the first thing to revisit if this
// page slows down. MAX_PAGES caps the work so a growing user table can
// never hang the admin screen.
//
// FAILURE MODE
//
// Every failure returns { known: false }, never a fabricated "never".
// "unknown" and "never signed in" mean very different things to an admin
// deciding whether to call a prospect.

// This module is server-only in practice: it reads SUPABASE_SERVICE_ROLE_KEY,
// which is not a NEXT_PUBLIC_ variable and is therefore undefined in the
// browser. Never import it from a client component. (The `server-only`
// package is not a dependency of this repo, so this is a convention, the
// same one lib/auth/requireSuperAdmin.ts relies on.)
import { createClient } from '@supabase/supabase-js'

/** Sign-in times keyed by auth user id. */
export interface SignInIndex {
  /** False when the lookup could not run; consumers must not read `byUserId`. */
  known: boolean
  byUserId: Map<string, string | null>
}

const PAGE_SIZE = 1000
const MAX_PAGES = 10 // 10k users; see COST above.

/**
 * Fetch last_sign_in_at for every auth user.
 *
 * Returns { known: false } when the service-role key is absent or the API
 * errors, so callers can render "unknown" instead of a wrong "never".
 */
export async function fetchSignInIndex(): Promise<SignInIndex> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const empty: SignInIndex = { known: false, byUserId: new Map() }
  if (!url || !serviceKey) return empty

  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const byUserId = new Map<string, string | null>()

    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: PAGE_SIZE,
      })
      if (error) return empty

      const users = data?.users ?? []
      for (const u of users) {
        byUserId.set(u.id, u.last_sign_in_at ?? null)
      }

      // Short page means we reached the end.
      if (users.length < PAGE_SIZE) break
    }

    return { known: true, byUserId }
  } catch {
    // Never let an admin-API failure break the admin page.
    return empty
  }
}
