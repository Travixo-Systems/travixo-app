// lib/subscription.ts
import { createClient } from '@/lib/supabase/client';

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  max_assets: number;
  max_users: number;
  features: {
    qr_generation: boolean;
    public_scanning: boolean;
    basic_reports: boolean;
    csv_export: boolean;
    email_support: boolean;
    vgp_compliance: boolean;
    digital_audits: boolean;
    api_access: boolean;
    custom_branding: boolean;
    priority_support: boolean;
    dedicated_support?: boolean;
    custom_integrations?: boolean;
  };
  is_active: boolean;
  display_order: number;
}

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: 'trialing' | 'active' | 'cancelled' | 'expired' | 'past_due';
  billing_cycle: 'monthly' | 'yearly';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  plan: SubscriptionPlan;
}

export interface SubscriptionUsage {
  assets: number;
  max_assets: number;
  limit_reached: boolean;
}

export interface SubscriptionInfo {
  subscription: Subscription | null;
  usage: SubscriptionUsage;
  is_pilot: boolean;
  is_trial: boolean;
  days_remaining: number | null;
}

/**
 * Check if organization has access to a specific feature
 */
export async function hasFeatureAccess(
  feature: keyof SubscriptionPlan['features']
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

    // Check if pilot
    const { data: org } = await supabase
      .from('organizations')
      .select('is_pilot, pilot_start_date, pilot_end_date')
      .eq('id', userData.organization_id)
      .single();

    if (org?.is_pilot) {
      const now = new Date();
      const start = org.pilot_start_date ? new Date(org.pilot_start_date) : null;
      const end = org.pilot_end_date ? new Date(org.pilot_end_date) : null;
      
      if (start && end && now >= start && now <= end) {
        return true; // Pilots get everything
      }
    }

    // Check subscription plan features
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('organization_id', userData.organization_id)
      .single();

    if (!subscription?.plan) return false;

    return subscription.plan.features[feature] === true;
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

    // Get current asset count
    const { count: assetCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', userData.organization_id);

    // Get subscription limit
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('organization_id', userData.organization_id)
      .single();

    const maxAssets = subscription?.plan?.max_assets || 100;
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
  billingCycle: 'monthly' | 'yearly'
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_slug: planSlug, billing_cycle: billingCycle })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || data.message };
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