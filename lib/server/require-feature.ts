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
