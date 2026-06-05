'use server'

// app/(admin)/admin/orgs/[id]/actions.ts
// Platform-admin Phase 2 write actions. Server-only.
//
// Each action is a THIN wrapper around a SECURITY DEFINER Postgres
// function (public.extend_trial / public.set_feature_flag). The wrapper:
//   1. gates on platform_admins membership (requireSuperAdmin)
//   2. validates input against the same allowlists the DB enforces
//      (fail fast, before the round-trip)
//   3. calls the RPC, which performs mutation + audit insert in ONE
//      transaction (audit failure rolls back the mutation)
//   4. revalidates the org detail page so the UI reflects the write
//
// The DB function re-checks is_super_admin() and re-validates input, so
// these wrappers are defense-in-depth, not the only line of defense.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/auth/requireSuperAdmin'
import {
  isAllowedExtendDays,
  isAllowedFlag,
  type ExtendDays,
} from '@/lib/admin/featureFlags'

export interface ActionResult {
  ok: boolean
  error?: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// extendTrial(orgId, days)
//   days must be one of {7,14,30}. Extends pilot_end_date for pilot orgs,
//   else trial_ends_at. Never shortens (handled in SQL).
// ---------------------------------------------------------------------------
export async function extendTrial(
  orgId: string,
  days: number
): Promise<ActionResult> {
  // Gate: redirects non-admins. Returns for admins.
  await requireSuperAdmin()

  if (!UUID_RE.test(orgId)) {
    return { ok: false, error: 'Invalid organization id.' }
  }
  if (!isAllowedExtendDays(days)) {
    return { ok: false, error: 'Extension length must be 7, 14, or 30 days.' }
  }
  const safeDays: ExtendDays = days

  const supabase = await createClient()
  const { error } = await supabase.rpc('extend_trial', {
    p_org_id: orgId,
    p_days: safeDays,
  })

  if (error) {
    // Surface the DB-side rejection reason without leaking internals.
    return { ok: false, error: mapRpcError(error.message) }
  }

  revalidatePath(`/admin/orgs/${orgId}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// toggleFeatureFlag(orgId, flag, enabled)
//   flag must be in ALLOWED_FLAGS. Flips exactly one jsonb key.
// ---------------------------------------------------------------------------
export async function toggleFeatureFlag(
  orgId: string,
  flag: string,
  enabled: boolean
): Promise<ActionResult> {
  await requireSuperAdmin()

  if (!UUID_RE.test(orgId)) {
    return { ok: false, error: 'Invalid organization id.' }
  }
  if (!isAllowedFlag(flag)) {
    return { ok: false, error: 'Unknown feature flag.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_feature_flag', {
    p_org_id: orgId,
    p_flag: flag,
    p_enabled: enabled,
  })

  if (error) {
    return { ok: false, error: mapRpcError(error.message) }
  }

  revalidatePath(`/admin/orgs/${orgId}`)
  return { ok: true }
}

// Translate raised SQL exceptions into stable, user-facing messages.
function mapRpcError(message: string): string {
  if (message.includes('not_authorized')) return 'Not authorized.'
  if (message.includes('invalid_days')) return 'Extension length not allowed.'
  if (message.includes('invalid_flag')) return 'Feature flag not allowed.'
  if (message.includes('org_not_found')) return 'Organization not found.'
  return 'Action failed.'
}
