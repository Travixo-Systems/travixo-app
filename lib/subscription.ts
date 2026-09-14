// lib/subscription.ts
import { createClient } from '@/lib/supabase/client';

/**
 * Central feature registry, single source of truth for all gated features.
 * Add new features here; the FeatureKey type updates automatically.
 */
export const FEATURE_REGISTRY = {
  qr_generation: { title: 'QR Generation', description: 'QR code generation for assets.' },
  public_scanning: { title: 'Public Scanning', description: 'Public asset scanning via QR codes.' },
  basic_reports: { title: 'Basic Reports', description: 'Standard reporting dashboards.' },
  csv_export: { title: 'CSV Export', description: 'Export data to CSV files.' },
  email_support: { title: 'Email Support', description: 'Email-based customer support.' },
  vgp_compliance: { title: 'VGP Compliance Module', description: 'VGP compliance tracking is available on Professional plans and above. Upgrade to automate your French regulatory compliance.' },
  digital_audits: { title: 'Digital Audits', description: 'Digital audit workflows are available on Professional plans and above. Upgrade to streamline your inventory audits.' },
  api_access: { title: 'API Access', description: 'API access is available on Business and Enterprise plans. Upgrade to integrate TraviXO with your existing systems.' },
  custom_branding: { title: 'Custom Branding', description: 'Custom branding is available on Enterprise plans. Upgrade to white-label the platform for your organization.' },
  priority_support: { title: 'Priority Support', description: 'Priority customer support channels.' },
  dedicated_support: { title: 'Dedicated Support', description: 'Dedicated support is available on Business and Enterprise plans. Upgrade for priority assistance.' },
  custom_integrations: { title: 'Custom Integrations', description: 'Custom integrations are available on Enterprise plans. Upgrade for tailored integration solutions.' },
  rental_management: { title: 'Rental Management', description: 'Equipment rental tracking is available on Professional plans and above. Upgrade to track who has your equipment and block non-compliant checkouts.' },
} as const;

export type FeatureKey = keyof typeof FEATURE_REGISTRY;

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
  features: Record<FeatureKey, boolean | string>;
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
 * Check if organization has access to a specific feature.
 * Uses the database `has_feature_access` RPC for a single round-trip that
 * validates pilot dates and subscription status in one query.
 */
export async function hasFeatureAccess(
  feature: FeatureKey
): Promise<boolean> {
  try {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!userData?.organization_id) return false;

    // Single RPC call, pilot check + status check + feature lookup
    const { data: hasAccess, error } = await supabase.rpc('has_feature_access', {
      org_id: userData.organization_id,
      feature_name: feature,
    });

    if (error) {
      console.error('Feature access RPC error:', error);
      return false;
    }

    return hasAccess === true;
  } catch (error) {
    console.error('Feature access check error:', error);
    return false;
  }
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

/**
 * Get plan badge color
 */
export function getPlanBadgeColor(planSlug: string): string {
  switch (planSlug) {
    case 'starter':
      return 'bg-gray-100 text-gray-800';
    case 'professional':
      return 'bg-blue-100 text-blue-800';
    case 'business':
      return 'bg-purple-100 text-purple-800';
    case 'enterprise':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get status badge color
 */
export function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'trialing':
      return 'bg-blue-100 text-blue-800';
    case 'active':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-yellow-100 text-yellow-800';
    case 'expired':
      return 'bg-red-100 text-red-800';
    case 'past_due':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}