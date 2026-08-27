import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import type { Database } from '@/types/database'
import { RESOLVED_SLOT_HEADER, cookieOptionsForSlot, parseSlot } from './account-slot'

/**
 * Resolve THIS request's account slot.
 *
 * Reads RESOLVED_SLOT_HEADER, which proxy.ts writes AFTER validating the
 * client-supplied header. Never read the inbound ACCOUNT_SLOT_HEADER here:
 * that one is attacker-controlled and has not been bounded yet.
 *
 * Falls back to slot 0 whenever the header is absent -- which is the correct
 * behaviour for anything that did not pass through the proxy, and keeps the
 * original cookie name for ordinary single-account use.
 */
export async function getRequestSlot(): Promise<number> {
  try {
    const h = await headers()
    // parseSlot is total: absent, malformed and out-of-range all give 0.
    return parseSlot(h.get(RESOLVED_SLOT_HEADER))
  } catch {
    // headers() throws outside a request scope (e.g. during prerender).
    return 0
  }
}

// This creates a Supabase client for use in Server Components
//
// The auth cookie name is resolved PER REQUEST from the tab's account slot,
// so two tabs on different slots read two different cookies and hold two
// different sessions. See lib/supabase/account-slot.ts.
export async function createClient() {
  const cookieStore = await cookies()

  // Read the slot the proxy resolved for this request. Absent -> slot 0.
  let slotRaw: string | null = null
  try {
    slotRaw = (await headers()).get(RESOLVED_SLOT_HEADER)
  } catch {
    // headers() is unavailable outside a request scope; slot 0 is correct.
    slotRaw = null
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: cookieOptionsForSlot(slotRaw),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch (error) {
            // The `setAll` method is called from Server Components
            // where cookies can't be set, ignore the error
          }
        },
      },
    }
  )
}
