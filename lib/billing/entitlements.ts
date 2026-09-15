import { createClient } from '@/lib/supabase/server';
import { isAccountLocked } from '@/lib/billing/pilot-window';
import { PILOT_MAX_ASSETS } from '@/lib/billing/access-model';

export interface EntitlementContext {
  organizationId: string;
  subscriptionStatus: string;
  planSlug: string;
  maxAssets: number;
  maxUsers: number;
  currentAssets: number;
  currentUsers: number;
  isPilot: boolean;
  pilotActive: boolean;
  pilotEndDate: string | null;
  pilotStartDate: string | null;
  convertedToPaid: boolean;
  accountLocked: boolean;
}

/**
 * Load the entitlement context for the current user.
 *
 * entitlement_overrides is no longer read: it only ever fed per-feature
 * gating, and every feature now ships on the one plan.
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

  const [subResult, assetCount, userCount, orgResult] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('organization_id', orgId)
      .single(),
    supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase
      .from('organizations')
      .select('is_pilot, pilot_start_date, pilot_end_date, converted_to_paid')
      .eq('id', orgId)
      .single(),
  ]);

  const sub = subResult.data as any;
  const org = orgResult.data as any;

  const isPilot = org?.is_pilot || false;
  const pilotActive = isPilot &&
    (!org?.pilot_start_date || new Date() >= new Date(org.pilot_start_date)) &&
    (!org?.pilot_end_date || new Date() <= new Date(org.pilot_end_date));

  const convertedToPaid = org?.converted_to_paid || false;
  // 30 days full, then 15 read-only, then locked. Window lives in one place.
  const accountLocked = isAccountLocked({
    isPilot,
    pilotActive,
    convertedToPaid,
    pilotStartDate: org?.pilot_start_date,
  });

  return {
    organizationId: orgId,
    subscriptionStatus: sub?.status || 'trialing',
    planSlug: sub?.plan?.slug || 'starter',
    // Licensed capacity, NOT the plan's max_assets: that is the int4 sentinel
    // on the travixo row. Mirrors org_max_assets(): pilot allowance while a
    // pilot runs, else what was actually licensed, else a finite floor.
    maxAssets: pilotActive
      ? PILOT_MAX_ASSETS
      : (typeof sub?.licensed_capacity === 'number' ? sub.licensed_capacity : 100),
    maxUsers: sub?.plan?.max_users || 5,
    currentAssets: assetCount.count || 0,
    currentUsers: userCount.count || 0,
    isPilot,
    pilotActive,
    pilotEndDate: org?.pilot_end_date || null,
    pilotStartDate: org?.pilot_start_date || null,
    convertedToPaid,
    accountLocked,
  };
}

/**
 * Check if org can create more assets
 */
export function canCreateAsset(ctx: EntitlementContext): boolean {
  // There is no unlimited tier any more. This used to short-circuit on the
  // old enterprise sentinel (999999); with subscription_plans.max_assets now
  // 2147483647 on the only active plan row, that check granted every
  // organization unlimited assets. Capacity is finite and always compared.
  return ctx.currentAssets < ctx.maxAssets;
}

/**
 * Check if org can invite more users
 */
export function canInviteUser(ctx: EntitlementContext): boolean {
  // Users are UNLIMITED under capacity pricing, deliberately: what is sold is
  // asset capacity, and seats are not metered. The subscription page states
  // "unlimited users" as an included feature.
  //
  // This used to be a >= 999999 sentinel check that happened to return true
  // because max_users on the travixo row is the int4 sentinel. That produced
  // the right answer for the wrong reason, and would have started refusing
  // invitations the moment anyone put a real number in that column. Stated
  // outright instead.
  return true;
}
