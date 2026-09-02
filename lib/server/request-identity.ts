// lib/server/request-identity.ts
//
// Resolve "who is calling, and which organization are they in" ONCE per
// request instead of once per gate.
//
// ---------------------------------------------------------------------------
// WHY
// ---------------------------------------------------------------------------
// requireWriteAccess() and requireFeature() each start the same way: call
// auth.getUser(), then select users.organization_id. Routes that use both --
// recording a VGP inspection is the clearest case -- therefore pay that pair
// twice, and the inspection route calls getUser() a third time itself.
//
// getUser() is NOT a local token decode. It is a network round trip to the
// GoTrue server to validate the JWT. The audit counted 72 call sites across
// the app; at 1,000 concurrent users the auth service becomes the contention
// point well before Postgres does.
//
// React's cache() memoises per request, which is exactly the lifetime wanted
// here: two gates in one request share a result, two concurrent requests from
// different users do not. Nothing is cached across requests, so a signed-out
// user is never served a previous caller's identity.
//
// ---------------------------------------------------------------------------
// WHAT THIS DELIBERATELY DOES NOT CACHE
// ---------------------------------------------------------------------------
// Only identity: the user and their organization id. Not entitlement, not
// pilot state, not feature access. Those are authorisation decisions, and
// caching them -- even briefly -- is how a revoked plan keeps working. The
// organizations row that requireWriteAccess reads, and the has_feature_access
// RPC that requireFeature calls, are left alone on purpose.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RequestIdentity {
  userId: string | null
  organizationId: string | null
  /** Why resolution failed, for the caller to turn into a response. */
  reason: 'ok' | 'unauthenticated' | 'no_organization'
}

/**
 * The uncached implementation. Exported for tests and for callers that
 * genuinely need a fresh read; everything else should use resolveIdentity().
 */
export async function resolveIdentityUncached(
  supabase: SupabaseClient
): Promise<RequestIdentity> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { userId: null, organizationId: null, reason: 'unauthenticated' }
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (userError || !userData?.organization_id) {
    return { userId: user.id, organizationId: null, reason: 'no_organization' }
  }

  return {
    userId: user.id,
    organizationId: userData.organization_id,
    reason: 'ok',
  }
}

/**
 * Request-scoped identity.
 *
 * cache() keys on the arguments, so the Supabase client passed in must be the
 * same object for the memo to hit. That is the normal case: a route handler
 * builds one client and hands it to both gates. A route that constructs a
 * second client gets a second lookup, which is correct rather than surprising
 * -- a different client may carry a different session.
 */
export const resolveIdentity = cache(
  async (supabase: SupabaseClient): Promise<RequestIdentity> =>
    resolveIdentityUncached(supabase)
)
