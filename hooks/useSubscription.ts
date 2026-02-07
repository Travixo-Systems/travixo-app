// hooks/useSubscription.ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubscriptionInfo,
  updateSubscription,
  checkAssetLimit,
  ACTIVE_STATUSES,
  type SubscriptionInfo,
  type SubscriptionPlan,
  type FeatureKey
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
 * Check if user has access to a feature.
 *
 * Returns `{ hasAccess, isLoading }` so consumers can distinguish between
 * "still loading" and "no access", preventing a flash of locked content
 * for paying users. Also validates subscription status is active/trialing.
 */
export function useFeatureAccess(feature: FeatureKey): { hasAccess: boolean; isLoading: boolean } {
  const { data: subscriptionInfo, isLoading } = useSubscription();

  if (isLoading || !subscriptionInfo) {
    return { hasAccess: false, isLoading: true };
  }

  // Pilots get everything (pilot date validation is done server-side in the API)
  if (subscriptionInfo.is_pilot) {
    return { hasAccess: true, isLoading: false };
  }

  const sub = subscriptionInfo.subscription;
  if (!sub?.plan) {
    return { hasAccess: false, isLoading: false };
  }

  // Check subscription is in an active state before granting access
  const statusOk = ACTIVE_STATUSES.has(sub.status);
  const featureEnabled = sub.plan.features?.[feature] === true;

  return { hasAccess: statusOk && featureEnabled, isLoading: false };
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
    mutationFn: ({ planSlug, billingCycle }: { planSlug: string; billingCycle: 'monthly' | 'yearly' }) =>
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
 * Get usage statistics
 */
export function useUsage() {
  const { data: subscriptionInfo } = useSubscription();
  return subscriptionInfo?.usage || { assets: 0, max_assets: 100, limit_reached: false };
}

/**
 * Check if org has an active Stripe subscription
 */
export function useHasStripeSubscription() {
  const { data: subscriptionInfo } = useSubscription();
  return !!subscriptionInfo?.subscription?.stripe_subscription_id;
}

/**
 * Initiate Stripe Checkout — redirects to Stripe-hosted payment page
 */
export function useStripeCheckout() {
  return useMutation({
    mutationFn: async ({ planSlug, billingCycle }: { planSlug: string; billingCycle: 'monthly' | 'yearly' }) => {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug, billingCycle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      return data as { url: string };
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });
}

/**
 * Open Stripe Billing Portal — redirects to Stripe-hosted portal
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