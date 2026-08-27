/**
 * Service term: bonus months granted on an annual commitment.
 *
 * Professional annual is €14 400, which is exactly 12 x €1 200 — paying yearly
 * costs the same as paying monthly, so the annual option carried no advantage.
 * The discount is delivered as DURATION rather than a lower price: the same
 * €14 400 buys 15 months of service.
 *
 * Stripe has no 15-month billing interval. The term is implemented as the
 * normal 12-month price plus a 90-day trial on the subscription, so the
 * customer pays once and is not charged again until month 15.
 *
 * Monthly is deliberately untouched. A monthly subscriber is billed every
 * month, so there is no yearly cycle to extend; giving them free months would
 * be a different mechanism (skipped invoices), not a term.
 *
 * Keep this in step with the marketing site. The site advertises
 * "15 mois de service" / "15 months of service" on the Professional annual
 * card, and the 30-vs-15 trial drift happened precisely because a public
 * number lived in more than one place. This is the only place it lives.
 */

import type { PlanSlug, BillingCycle } from '@/lib/stripe'

/** Bonus months granted, keyed by plan, and only ever on an annual cycle. */
const ANNUAL_BONUS_MONTHS: Partial<Record<string, number>> = {
  professional: 3,
}

/** Days Stripe should defer the first renewal by, per bonus month. */
const DAYS_PER_BONUS_MONTH = 30

/** Months in a standard annual commitment, before any bonus. */
export const BASE_ANNUAL_MONTHS = 12

/**
 * Bonus months for a plan/cycle pair. Zero for every monthly cycle and for any
 * plan without an entry, so a new plan cannot silently inherit a discount.
 */
export function bonusMonths(planSlug: string, cycle: BillingCycle): number {
  if (cycle !== 'yearly') return 0
  return ANNUAL_BONUS_MONTHS[planSlug] ?? 0
}

/**
 * Total months of service purchased. 12 for a plain annual plan, 15 for
 * Professional annual, 1 for anything monthly.
 */
export function serviceMonths(planSlug: string, cycle: BillingCycle): number {
  if (cycle !== 'yearly') return 1
  return BASE_ANNUAL_MONTHS + bonusMonths(planSlug, cycle)
}

/**
 * Trial days to attach to a Stripe subscription so the bonus months land
 * before the first renewal. Returns undefined when there is no bonus, so the
 * caller can omit trial_period_days entirely rather than sending a zero —
 * Stripe rejects trial_period_days: 0.
 */
export function trialPeriodDays(
  planSlug: string,
  cycle: BillingCycle
): number | undefined {
  const bonus = bonusMonths(planSlug, cycle)
  return bonus > 0 ? bonus * DAYS_PER_BONUS_MONTH : undefined
}

/** True when this plan/cycle pair carries bonus months worth advertising. */
export function hasBonusTerm(planSlug: string, cycle: BillingCycle): boolean {
  return bonusMonths(planSlug, cycle) > 0
}

export type { PlanSlug }
