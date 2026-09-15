// lib/subscription.ts
import { createClient } from '@/lib/supabase/client';

/**
 * Features are no longer gated per plan.
 *
 * FEATURE_REGISTRY and FeatureKey lived here to drive per-feature access
 * checks and the upgrade prompts behind them. There is one plan now and it
 * carries everything, so a per-feature question has no answer but yes. Both
 * are deleted rather than left returning true, along with every gate that
 * consumed them. subscription_plans.features still exists as a column; nothing
 * reads it at runtime.
 *
 * What survives is ACCESS gating: requireWriteAccess / writeDenialReason,
 * answering whether the organization is current.
 */

/** Valid subscription statuses that grant feature access */
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing']);

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  max_assets: number;
  max_users: number;
  /** Retained column, not read at runtime. */
  features: Record<string, boolean | string>;
  is_active: boolean;
  display_order: number;
}

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  stripe_subscription_id: string | null;
  status: 'trialing' | 'active' | 'cancelled' | 'expired' | 'past_due';
  /** Spelled 'annual', matching STRIPE_PRICE_*_ANNUAL and the DB column. */
  billing_cycle: 'monthly' | 'annual';
  /** Licensed asset capacity: the Stripe subscription item quantity. */
  licensed_capacity: number | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  plan: SubscriptionPlan;
}

export interface SubscriptionUsage {
  /** Unarchived assets, including demo data. */
  assets: number;
  /** Unarchived assets excluding demo data: what a licence is sold against. */
  billable: number;
  /**
   * Effective ceiling. Pilot allowance while a pilot runs, else the licensed
   * capacity, else a finite floor. Never subscription_plans.max_assets, which
   * is an int4 sentinel on the travixo row.
   */
  max_assets: number;
  /** Stripe subscription item quantity. NULL when there is no subscription. */
  licensed_capacity: number | null;
  limit_reached: boolean;
  /** Billable count exceeds a capacity that was actually purchased. */
  over_capacity: boolean;
}

export interface SubscriptionInfo {
  subscription: Subscription | null;
  usage: SubscriptionUsage;
  is_pilot: boolean;
  is_trial: boolean;
  days_remaining: number | null;
  pilot_active: boolean;
  pilot_end_date: string | null;
  vgp_access: 'full' | 'read_only' | 'blocked';
  account_locked: boolean;
}

/**
 * Check asset limit status
 */
export async function checkAssetLimit(): Promise<{
  current: number;
  max: number;
  limitReached: boolean;
}> {
  try {
    const supabase = createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { current: 0, max: 100, limitReached: false };
    }

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!userData?.organization_id) {
      return { current: 0, max: 100, limitReached: false };
    }

    // Billable assets: archived excluded, demo excluded. Matches what the
    // insert trigger counts and what a licence is sold against. is_demo_data is
    // nullable, so .eq(false) would drop legacy rows and under-report.
    const { count: assetCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', userData.organization_id)
      .is('archived_at', null)
      .or('is_demo_data.eq.false,is_demo_data.is.null');

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('licensed_capacity')
      .eq('organization_id', userData.organization_id)
      .single();

    // Licensed capacity, never subscription_plans.max_assets: that column is
    // the int4 sentinel (2147483647) on the travixo row, and surfacing it would
    // tell a customer they have two billion assets of headroom. Falls back to
    // the same finite floor org_max_assets() uses.
    const licensedCapacity = (subscription as { licensed_capacity: number | null } | null)?.licensed_capacity;
    const maxAssets = typeof licensedCapacity === 'number' ? licensedCapacity : 100;
    const current = assetCount || 0;

    return {
      current,
      max: maxAssets,
      limitReached: current >= maxAssets
    };
  } catch (error) {
    console.error('Asset limit check error:', error);
    return { current: 0, max: 100, limitReached: false };
  }
}

/**
 * Get subscription info
 */
export async function getSubscriptionInfo(): Promise<SubscriptionInfo | null> {
  try {
    const response = await fetch('/api/subscriptions');
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Get subscription info error:', error);
    return null;
  }
}

/**
 * Update subscription plan
 */
export async function updateSubscription(
  planSlug: string,
  billingCycle: 'monthly' | 'annual'
): Promise<{ success: boolean; error?: string; message?: string }> {  // ADD message here
  try {
    const response = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_slug: planSlug, billing_cycle: billingCycle })
    });

    const data = await response.json();

    if (!response.ok) {
      return { 
        success: false, 
        error: data.error,
        message: data.message  // ADD this line
      };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Format price with currency
 */
export function formatPrice(amount: number, yearly: boolean = false): string {
  const price = yearly ? amount / 12 : amount;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

/**
 * Calculate days remaining in period
 */
export function getDaysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
