// lib/auth/requireSuperAdminApi.ts
// Platform-admin gate for API ROUTE HANDLERS.
//
// WHY THIS EXISTS SEPARATELY FROM requireSuperAdmin()
//
// lib/auth/requireSuperAdmin.ts calls redirect('/') on failure. That is right
// for a server component -- the visitor lands on the home page -- but wrong for
// an API route: redirect() throws a Next.js control-flow error that surfaces to
// a POST caller as a 307 to '/', not as a refusal. A machine caller cannot read
// a redirect as "denied", and neither can a fetch() in the browser.
//
// So this returns a response to send instead of throwing, matching the shape of
// lib/server/require-write-access.ts:
//
//   const gate = await requireSuperAdminApi(supabase)
//   if (gate.denied) return gate.denied
//
// IDENTITY MODEL (B1)
//
// A platform admin is a row in public.platform_admins, checked through the
// is_super_admin() SECURITY DEFINER function -- the same chokepoint every RLS
// policy routes through. It is NOT a tenant role. An admin's public.users row
// carries an ordinary role ('member') and a NULL organization_id, so a tenant
// role check both admits the wrong people and excludes the right ones.
//
// Fails closed: an RPC error denies rather than allows.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SuperAdminApiResult {
  /** null when the caller is a platform admin; a 401/403 response otherwise. */
  denied: NextResponse | null
  /** The admin's auth user id, when allowed. */
  userId: string | null
  /** The admin's email, when allowed. For logging. */
  email: string | null
}

export async function requireSuperAdminApi(
  supabase: SupabaseClient
): Promise<SuperAdminApiResult> {
  // Authoritative identity check: getUser() validates the session against the
  // auth server. Never gate on getSession(), which trusts the cookie as-is.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      denied: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
      userId: null,
      email: null,
    }
  }

  const { data: isAdmin, error } = await supabase.rpc('is_super_admin')

  // Fail closed. An RPC failure is not evidence of privilege.
  if (error || isAdmin !== true) {
    return {
      denied: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
      userId: user.id,
      email: user.email ?? null,
    }
  }

  return { denied: null, userId: user.id, email: user.email ?? null }
}
