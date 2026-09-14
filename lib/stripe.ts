import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
  typescript: true,
});

/**
 * One product, two prices, keyed by billing interval.
 *
 * There is no plan concept any more. The old starter/professional/business
 * tiers are gone: what a customer buys is LICENSED ASSET CAPACITY, priced by
 * the graduated tiers on these two Stripe prices. Capacity is the `quantity`
 * on the subscription item, not a plan name.
 *
 * Both prices are tiered/graduated in EUR: a flat 179.00 covers the first 100
 * assets, then 1.55 / 1.20 / 0.80 per asset across the 500 / 1000 / infinity
 * bands. The annual price is the same shape x10 -- ten months of the monthly
 * rate for twelve months of service, which is where the annual discount now
 * lives. Nothing else may grant bonus months on top; that would apply the
 * discount twice.
 */
export const PRICE_MAP: Record<BillingCycle, string> = {
  monthly: process.env.STRIPE_PRICE_TRAVIXO_MONTHLY!,
  annual: process.env.STRIPE_PRICE_TRAVIXO_ANNUAL!,
};

/**
 * Billing interval.
 *
 * Spelled 'annual', matching the env vars (STRIPE_PRICE_TRAVIXO_ANNUAL) and the
 * subscription_plans.stripe_price_annual column. The code used to say 'yearly'
 * while everything around it said annual; that split is resolved here.
 */
export type BillingCycle = 'monthly' | 'annual';

/** The single plan slug backing every subscription. */
export const TRAVIXO_PLAN_SLUG = 'travixo';

/**
 * Capacity sizing and the price formula live in lib/billing/capacity-price.ts,
 * which has no dependencies so client components can import it too. Re-exported
 * here so server code that already imports from this module keeps one import,
 * and so there is exactly one definition of each.
 */
export {
  MAX_SELF_SERVE_CAPACITY,
  CAPACITY_BLOCK,
  licensedCapacityFor,
  monthlyPrice,
  annualPrice,
} from '@/lib/billing/capacity-price';

/**
 * Reverse lookup: Stripe Price ID -> billing cycle.
 *
 * Returns null for anything unrecognised. Callers must treat null as a hard
 * failure rather than falling back to a default -- a price we cannot resolve
 * means we cannot tell what the customer bought.
 */
export function cycleFromPriceId(priceId: string): BillingCycle | null {
  for (const [cycle, id] of Object.entries(PRICE_MAP) as [BillingCycle, string][]) {
    if (id && id === priceId) return cycle;
  }
  return null;
}

/**
 * Get or create a Stripe customer for an organization
 */
export async function getOrCreateStripeCustomer(
  organizationId: string,
  organizationName: string,
  email: string,
  existingCustomerId?: string | null
): Promise<string> {
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customer = await stripe.customers.create({
    name: organizationName,
    email,
    metadata: { organization_id: organizationId },
  });

  return customer.id;
}
