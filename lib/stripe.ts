import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
  typescript: true,
});

// Maps plan slug + billing cycle to Stripe Price ID
export const PRICE_MAP: Record<string, Record<string, string>> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
    yearly: process.env.STRIPE_PRICE_STARTER_ANNUAL!,
  },
  professional: {
    monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY!,
    yearly: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL!,
  },
  business: {
    monthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY!,
    yearly: process.env.STRIPE_PRICE_BUSINESS_ANNUAL!,
  },
};

export type PlanSlug = keyof typeof PRICE_MAP;
export type BillingCycle = 'monthly' | 'yearly';

/**
 * Reverse lookup: Stripe Price ID → plan slug + billing cycle
 */
export function planFromPriceId(priceId: string): { slug: PlanSlug; cycle: BillingCycle } | null {
  for (const [slug, prices] of Object.entries(PRICE_MAP)) {
    if (prices.monthly === priceId) return { slug: slug as PlanSlug, cycle: 'monthly' };
    if (prices.yearly === priceId) return { slug: slug as PlanSlug, cycle: 'yearly' };
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
