// lib/auth/requireSuperAdmin.ts
// Server-only auth gate for platform-admin (/admin) routes.
//
// IDENTITY MODEL (B1): a platform admin is a member of the
// public.platform_admins table, NOT a holder of any tenant role. The
// admin's public.users row is an ordinary row with organization_id = NULL
// and a normal role (e.g. 'member'); it conveys NO privilege on its own.
// Privilege is membership in platform_admins, checked here via the
// is_super_admin() SECURITY DEFINER function (the same chokepoint every
// RLS policy routes through).
//
// Call this at the top of every /admin server component (or once in the
// admin layout). Any non-admin (including a signed-out visitor) is
// redirected to '/'.
//
// Returns the authenticated admin's id + their users row (for display).
// The users row is fetched best-effort: the admin is org-less, and even a
// missing row does not revoke access (membership is authoritative).
//
// This module is server-only in practice: it imports the cookie-based
// Supabase server client and next/navigation redirect, neither of which
// can run in a client component.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export interface AdminProfile {
  id: string
  email: string
  full_name: string | null
  role: string
  // Platform admins are org-less; this is expected to be null in B1.
  organization_id: string | null
}

export interface RequireSuperAdminResult {
  userId: string
  // The admin's email (from auth), always present.
  email: string
  // The admin's users row, if one exists. May be null in the defensive
  // case where membership exists without a profile row.
  profile: AdminProfile | null
}

export async function requireSuperAdmin(): Promise<RequireSuperAdminResult> {
  const supabase = await createClient()

  // Authoritative identity check: getUser() validates the session with the
  // Supabase auth server (do not trust getSession() for gating).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Gate on platform_admins membership via is_super_admin(). This is the
  // single source of truth shared with every RLS policy. It is
  // SECURITY DEFINER, so it returns the correct answer regardless of the
  // caller's RLS on platform_admins.
  const { data: isAdmin, error: rpcError } = await supabase.rpc('is_super_admin')

  if (rpcError || isAdmin !== true) {
    redirect('/')
  }

  // Best-effort profile for display only. The admin is org-less, so we do
  // NOT assume an organization and do NOT throw on a null org. A missing
  // row also does not revoke access (membership above is authoritative).
  const { data: profile } = await supabase
    .from('users')
    .select('id, email, full_name, role, organization_id')
    .eq('id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    email: user.email ?? (profile?.email ?? ''),
    profile: (profile as AdminProfile | null) ?? null,
  }
}
