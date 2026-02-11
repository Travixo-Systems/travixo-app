// lib/server/require-feature.ts
// Server-side feature gate enforcement for API routes.
// Uses the database `has_feature_access` RPC so pilot dates and subscription
// status are validated in a single round-trip.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeatureKey } from '@/lib/subscription';

interface FeatureCheckResult {
  /** null when access is granted; a 403 NextResponse when denied */
  denied: NextResponse | null;
  organizationId: string | null;
}

/**
 * Verify the authenticated user's organization has access to `feature`.
 *
 * Usage in a route handler:
 * ```ts
 * const { denied, organizationId } = await requireFeature(supabase, 'vgp_compliance');
 * if (denied) return denied;
 * // proceed — organizationId is guaranteed non-null here
 * ```
 */
export async function requireFeature(
  supabase: SupabaseClient,
  feature: FeatureKey,
): Promise<FeatureCheckResult> {
  // 1. Authenticate
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      organizationId: null,
    };
  }

  // 2. Resolve organization
  const { data: userData } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const orgId = userData?.organization_id;
  if (!orgId) {
    return {
      denied: NextResponse.json({ error: 'No organization found' }, { status: 403 }),
      organizationId: null,
    };
  }

  // 3. Single RPC call — checks pilot period + subscription status + feature flag
  const { data: hasAccess, error: rpcError } = await supabase.rpc('has_feature_access', {
    org_id: orgId,
    feature_name: feature,
  });

  if (rpcError) {
    console.error(`[FeatureGate] RPC error for feature "${feature}":`, rpcError);
    return {
      denied: NextResponse.json(
        { error: 'Unable to verify feature access' },
        { status: 500 },
      ),
      organizationId: orgId,
    };
  }

  if (!hasAccess) {
    return {
      denied: NextResponse.json(
        {
          error: 'Feature not available',
          feature,
          message: `Your current plan does not include access to this feature. Please upgrade your subscription.`,
        },
        { status: 403 },
      ),
      organizationId: orgId,
    };
  }

  return { denied: null, organizationId: orgId };
}

/**
 * Verify the authenticated user's organization has WRITE access to VGP.
 *
 * Expired pilots get read-only VGP access — they can view data but cannot
 * create, edit, or delete inspections or schedules. This guard enforces that
 * at the API level.
 *
 * Usage in a route handler:
 * ```ts
 * const { denied, organizationId } = await requireVGPWriteAccess(supabase);
 * if (denied) return denied;
 * ```
 */
export async function requireVGPWriteAccess(
  supabase: SupabaseClient,
): Promise<FeatureCheckResult> {
  // First, run the standard feature check
  const result = await requireFeature(supabase, 'vgp_compliance');
  if (result.denied) return result;

  // Feature is available — now check if it's read-only (expired pilot)
  const { data: org } = await supabase
    .from('organizations')
    .select('is_pilot, pilot_end_date, subscription_tier')
    .eq('id', result.organizationId!)
    .single();

  if (!org) {
    return {
      denied: NextResponse.json({ error: 'Organization not found' }, { status: 403 }),
      organizationId: result.organizationId,
    };
  }

  // Expired pilot = read-only
  if (org.is_pilot && org.pilot_end_date) {
    const expired = new Date(org.pilot_end_date) < new Date();
    if (expired) {
      // Check if they've upgraded to a paid plan with VGP
      const paidPlans = ['professional', 'business', 'enterprise'];
      if (!paidPlans.includes(org.subscription_tier || '')) {
        return {
          denied: NextResponse.json(
            {
              error: 'VGP en lecture seule',
              message: 'Votre période pilote a expiré. Passez au plan Professionnel pour modifier les données VGP.',
              code: 'VGP_READ_ONLY',
            },
            { status: 403 },
          ),
          organizationId: result.organizationId,
        };
      }
    }
  }

  return result;
}
