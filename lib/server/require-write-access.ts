/**
 * Server-side write gate.
 *
 * Call this at the top of every mutating API route, after authentication.
 * It is the only place a write is actually refused — the React hooks that
 * render read-only UI are a courtesy to honest users, not a control.
 *
 * Deliberately separate from requireFeature(): that answers "does this plan
 * include this feature", reading public.has_feature_access(), which falls
 * through to `subscriptions.status IN ('active','trialing')` once a pilot
 * ends and therefore returns true forever. See lib/billing/access-model.ts
 * for why that function must never authorise a mutation.
 */

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { accessLevel, writeDenialReason } from '@/lib/billing/access-model'

export interface WriteAccessResult {
  /** null when the write may proceed; a 401/403/423 response otherwise */
  denied: NextResponse | null
  organizationId: string | null
}

/**
 * Verify the caller may perform a mutating request.
 *
 * Fails closed: any lookup error denies the write rather than allowing it,
 * because the alternative is an outage silently becoming free access.
 */
export async function requireWriteAccess(
  supabase: SupabaseClient
): Promise<WriteAccessResult> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return {
      denied: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
      organizationId: null,
    }
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (userError || !userData?.organization_id) {
    return {
      denied: NextResponse.json({ error: 'no_organization' }, { status: 403 }),
      organizationId: null,
    }
  }

  const orgId = userData.organization_id

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('is_pilot, pilot_start_date, pilot_end_date, converted_to_paid')
    .eq('id', orgId)
    .single()

  if (orgError || !org) {
    // Fail closed. A lookup failure must not read as "full access".
    return {
      denied: NextResponse.json({ error: 'organization_not_found' }, { status: 403 }),
      organizationId: orgId,
    }
  }

  const reason = writeDenialReason(org)
  if (!reason) {
    return { denied: null, organizationId: orgId }
  }

  // 423 Locked reads correctly for both states: the resource exists and is
  // readable, but is not currently writable.
  return {
    denied: NextResponse.json(
      {
        error: reason,
        access_level: accessLevel(org),
        message:
          reason === 'account_locked'
            ? "Votre accès a été désactivé. Souscrivez pour retrouver l'accès à vos données."
            : 'Votre pilote a expiré. Vos données restent consultables, mais les modifications sont suspendues.',
      },
      { status: 423 }
    ),
    organizationId: orgId,
  }
}
