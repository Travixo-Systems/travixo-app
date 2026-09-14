/**
 * Licensed-capacity pricing. THE single source of the formula.
 *
 * Deliberately dependency-free: no Stripe SDK, no Supabase, no env vars. The
 * settings page is a client component and must import this, and lib/stripe.ts
 * instantiates the Stripe SDK at module load and throws without
 * STRIPE_SECRET_KEY, so the formula cannot live there.
 *
 * Every number below is also encoded in the two graduated Stripe prices. These
 * figures are for DISPLAY: what Stripe invoices is whatever its own tiers say.
 * If the two ever disagree, Stripe is right and this file is the bug. The tiers
 * were verified against live Stripe at 1/100/101/250/500/501/1000/1001/2000 and
 * matched to the cent.
 */

/** Capacity is sold in blocks of this size. */
export const CAPACITY_BLOCK = 10

/** Above this, checkout refuses and sales take over. */
export const MAX_SELF_SERVE_CAPACITY = 2000

/** Flat price covering the first tier, in euros. */
export const BASE_PRICE = 179

/** Assets included in the flat base. */
export const BASE_ASSETS = 100

/** Annual is this many months of the monthly rate, for twelve months of service. */
export const ANNUAL_MONTHS = 10

/** Per-asset rates above the base, by upper bound of each band. */
export const TIERS = [
  { upTo: 500, rate: 1.55 },
  { upTo: 1000, rate: 1.2 },
  { upTo: 2000, rate: 0.8 },
] as const

/**
 * Monthly price in euros for a given licensed capacity.
 *
 *   179 + max(0, min(n,500)-100)*1.55
 *       + max(0, min(n,1000)-500)*1.20
 *       + max(0, min(n,2000)-1000)*0.80
 *
 * Rounded to cents because the intermediate products are binary floats:
 * 150 * 1.55 lands on 232.49999999999997, which would render as 411.49.
 */
export function monthlyPrice(capacity: number): number {
  const n = Number.isFinite(capacity) ? Math.max(0, capacity) : 0
  const raw =
    BASE_PRICE +
    Math.max(0, Math.min(n, 500) - 100) * 1.55 +
    Math.max(0, Math.min(n, 1000) - 500) * 1.2 +
    Math.max(0, Math.min(n, 2000) - 1000) * 0.8
  return Math.round(raw * 100) / 100
}

/** Annual price in euros: ten months of the monthly rate. */
export function annualPrice(capacity: number): number {
  return Math.round(monthlyPrice(capacity) * ANNUAL_MONTHS * 100) / 100
}

/**
 * Round a billable asset count up to the capacity actually licensed.
 *
 * Floor of one block: an organization with no assets still licenses the
 * smallest unit, and Stripe rejects quantity 0 on a subscription item.
 */
export function licensedCapacityFor(billableAssets: number): number {
  const safe = Number.isFinite(billableAssets) && billableAssets > 0 ? billableAssets : 0
  return Math.max(CAPACITY_BLOCK, Math.ceil(safe / CAPACITY_BLOCK) * CAPACITY_BLOCK)
}

/** True when this capacity is past the self-serve ceiling. */
export function isOverSelfServe(capacity: number): boolean {
  return capacity > MAX_SELF_SERVE_CAPACITY
}

/**
 * Euro formatting for display. Cents are shown only when they exist: 179 reads
 * as "179", 180.55 as "180,55". Rounding cents away would misstate a real
 * price, and showing ",00" on every round figure is noise.
 */
export function formatEuros(amount: number, locale: string = 'fr-FR'): string {
  const hasCents = Math.round(amount * 100) % 100 !== 0
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(amount)
}
