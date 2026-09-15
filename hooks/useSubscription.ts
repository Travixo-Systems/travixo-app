// hooks/useSubscription.ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubscriptionInfo,
  updateSubscription,
  checkAssetLimit,
  ACTIVE_STATUSES,
  type SubscriptionInfo,
  type SubscriptionPlan
} from '@/lib/subscription';

/**
 * Fetch current subscription data
 */
export function useSubscription() {
  return useQuery<SubscriptionInfo | null>({
    queryKey: ['subscription'],
    queryFn: getSubscriptionInfo,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  });
}

/**
 * Fetch available plans
 */
export function usePlans() {
  return useQuery<{ plans: SubscriptionPlan[] }>({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const response = await fetch('/api/subscriptions/plans');
      if (!response.ok) throw new Error('Failed to fetch plans');
      return response.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour (plans don't change often)
  });
}

/**
 * Check asset limit status
 */
export function useAssetLimit() {
  return useQuery({
    queryKey: ['asset-limit'],
    queryFn: checkAssetLimit,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Update subscription plan mutation
 */
export function useUpdateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planSlug, billingCycle }: { planSlug: string; billingCycle: 'monthly' | 'annual' }) =>
      updateSubscription(planSlug, billingCycle),
    onSuccess: () => {
      // Invalidate and refetch subscription data
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    },
  });
}

/**
 * Get current plan info
 */
export function useCurrentPlan() {
  const { data: subscriptionInfo } = useSubscription();
  return subscriptionInfo?.subscription?.plan || null;
}

/**
 * Check if subscription is in trial
 */
export function useIsTrial() {
  const { data: subscriptionInfo } = useSubscription();
  return subscriptionInfo?.is_trial || false;
}

/**
 * Check if user is a pilot
 */
export function useIsPilot() {
  const { data: subscriptionInfo } = useSubscription();
  return subscriptionInfo?.is_pilot || false;
}

/**
 * Get days remaining in current period
 */
export function useDaysRemaining() {
  const { data: subscriptionInfo } = useSubscription();
  return subscriptionInfo?.days_remaining || null;
}

/**
 * Get usage statistics.
 *
 * The fallback mirrors the database's own floor (org_max_assets returns 100
 * when there is no pilot and no licence), so a failed fetch reads as the most
 * restrictive real state rather than as unlimited.
 */
export function useUsage() {
  const { data: subscriptionInfo } = useSubscription();
  return (
    subscriptionInfo?.usage || {
      assets: 0,
      billable: 0,
      max_assets: 100,
      licensed_capacity: null,
      limit_reached: false,
      over_capacity: false,
    }
  );
}

/**
 * Check if org has an active Stripe subscription
 */
export function useHasStripeSubscription() {
  const { data: subscriptionInfo } = useSubscription();
  return !!subscriptionInfo?.subscription?.stripe_subscription_id;
}

/**
 * Initiate Stripe Checkout, redirects to Stripe-hosted payment page.
 *
 * There is no plan to choose: the route derives licensed capacity from the
 * organization's billable asset count, so the only choice is how often you are
 * billed. Sending a planSlug would be ignored at best.
 */
export function useStripeCheckout() {
  return useMutation({
    mutationFn: async ({ billingCycle }: { billingCycle: 'monthly' | 'annual' }) => {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingCycle }),
      });
      const data = await res.json();
      if (!res.ok) {
        // The over-capacity refusal carries a contact_sales code and the
        // counts. Preserve them so the caller can explain rather than showing
        // a bare error string.
        const err = new Error(data.error || 'Checkout failed') as Error & {
          code?: string;
          licensed_capacity?: number;
          billable_assets?: number;
        };
        err.code = data.code;
        err.licensed_capacity = data.licensed_capacity;
        err.billable_assets = data.billable_assets;
        throw err;
      }
      return data as { url: string; licensed_capacity: number };
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });
}

/**
 * Change licensed capacity on an existing subscription.
 *
 * Increases apply immediately and prorated; decreases are scheduled at period
 * end. The route decides which, from the direction of the change. This is the
 * ONLY path that changes capacity: asset CRUD must never call it.
 */
export function useCapacityChange() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ capacity }: { capacity: number }) => {
      const res = await fetch('/api/stripe/subscription/capacity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacity }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data.error || 'Capacity change failed') as Error & { code?: string };
        err.code = data.code;
        throw err;
      }
      return data as {
        capacity: number;
        previous_capacity?: number;
        pending_capacity?: number;
        changed: boolean;
        effective: 'immediately' | 'period_end' | 'unchanged';
        effective_at?: string | null;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['asset-limit'] });
    },
  });
}

/**
 * Open Stripe Billing Portal, redirects to Stripe-hosted portal
 */
export function useStripePortal() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Portal failed');
      return data as { url: string };
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });
}

/**
 * Get VGP access level: 'full' | 'read_only' | 'blocked'
 * - full: active pilot or Professional+ plan
 * - read_only: expired pilot (can view, cannot create/edit)
 * - blocked: no VGP access at all
 */
export function useVGPAccess(): {
  access: 'full' | 'read_only' | 'blocked';
  isLoading: boolean;
} {
  const { data: subscriptionInfo, isLoading } = useSubscription();

  if (isLoading || !subscriptionInfo) {
    return { access: 'blocked', isLoading: true };
  }

  const vgpAccess = (subscriptionInfo as any).vgp_access;
  if (vgpAccess) {
    return { access: vgpAccess, isLoading: false };
  }

  // Fallback: compute client-side
  if ((subscriptionInfo as any).pilot_active) {
    return { access: 'full', isLoading: false };
  }

  // 'travixo' is the single current plan; the rest are retired tiers, kept so
  // an organization still carrying one is not demoted.
  const planSlug = subscriptionInfo.subscription?.plan?.slug;
  if (['travixo', 'professional', 'business', 'enterprise'].includes(planSlug || '')) {
    return { access: 'full', isLoading: false };
  }

  // Account locked (30+ days since signup, not converted), blocked entirely
  if ((subscriptionInfo as any).account_locked) {
    return { access: 'blocked', isLoading: false };
  }

  if (subscriptionInfo.is_pilot && !(subscriptionInfo as any).pilot_active) {
    return { access: 'read_only', isLoading: false };
  }

  return { access: 'blocked', isLoading: false };
}

/**
 * Get pilot status with detailed info for banners
 */
export function usePilotStatus(): {
  isPilot: boolean;
  pilotActive: boolean;
  daysRemaining: number | null;
  pilotEndDate: string | null;
  accountLocked: boolean;
  isLoading: boolean;
} {
  const { data: subscriptionInfo, isLoading } = useSubscription();

  if (isLoading || !subscriptionInfo) {
    return { isPilot: false, pilotActive: false, daysRemaining: null, pilotEndDate: null, accountLocked: false, isLoading: true };
  }

  const info = subscriptionInfo as any;
  return {
    isPilot: info.is_pilot || false,
    pilotActive: info.pilot_active || false,
    daysRemaining: info.days_remaining || null,
    pilotEndDate: info.pilot_end_date || null,
    accountLocked: info.account_locked || false,
    isLoading: false,
  };
}