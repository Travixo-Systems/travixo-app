import { createClient } from '@/lib/supabase/server';

export type Feature =
  | 'qr_tracking'
  | 'public_scanning'
  | 'basic_reports'
  | 'csv_export'
  | 'email_support'
  | 'vgp_compliance'
  | 'digital_audits'
  | 'api_access'
  | 'custom_branding'
  | 'priority_support'
  | 'dedicated_support'
  | 'custom_integrations';

export interface EntitlementContext {
  organizationId: string;
  subscriptionStatus: string;
  planSlug: string;
  planFeatures: Record<string, boolean | string>;
  overrides: Array<{ feature: string; granted: boolean; expires_at: string | null }>;
  maxAssets: number;
  maxUsers: number;
  currentAssets: number;
  currentUsers: number;
}

/**
 * Load the full entitlement context for the current user.
 * 4 parallel DB queries for performance.
 */
export async function getEntitlementContext(): Promise<EntitlementContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userData } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!userData?.organization_id) return null;

  const orgId = userData.organization_id;

  const [subResult, overrideResult, assetCount, userCount] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('organization_id', orgId)
      .single(),
    supabase
      .from('entitlement_overrides')
      .select('feature, granted, expires_at')
      .eq('organization_id', orgId),
    supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
  ]);

  const sub = subResult.data as any;
  return {
    organizationId: orgId,
    subscriptionStatus: sub?.status || 'trialing',
    planSlug: sub?.plan?.slug || 'starter',
    planFeatures: sub?.plan?.features || {},
    overrides: overrideResult.data || [],
    maxAssets: sub?.plan?.max_assets || 100,
    maxUsers: sub?.plan?.max_users || 5,
    currentAssets: assetCount.count || 0,
    currentUsers: userCount.count || 0,
  };
}

/**
 * Check if org has access to a feature.
 * Resolution order: overrides → subscription status → plan features → deny
 */
export function hasFeature(ctx: EntitlementContext, feature: Feature): boolean {
  // 1. Check overrides (custom deals, pilots, promos)
  const override = ctx.overrides.find(o => o.feature === feature);
  if (override) {
    if (override.expires_at && new Date(override.expires_at) < new Date()) {
      // Expired override — fall through to plan check
    } else {
      return override.granted;
    }
  }

  // 2. Check subscription status
  if (!['active', 'trialing'].includes(ctx.subscriptionStatus)) {
    return false;
  }

  // 3. Check plan features (true = enabled, false/'on_demand' = not included)
  return ctx.planFeatures[feature] === true;
}

/**
 * Check if org can create more assets
 */
export function canCreateAsset(ctx: EntitlementContext): boolean {
  if (ctx.maxAssets >= 999999) return true;
  return ctx.currentAssets < ctx.maxAssets;
}

/**
 * Check if org can invite more users
 */
export function canInviteUser(ctx: EntitlementContext): boolean {
  if (ctx.maxUsers >= 999999) return true;
  return ctx.currentUsers < ctx.maxUsers;
}
