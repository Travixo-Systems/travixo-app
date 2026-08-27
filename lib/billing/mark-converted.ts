/**
 * Mark an organization as having converted from pilot to paying.
 *
 * Why this exists
 * ---------------
 * The Stripe webhook used to update `subscription_status` and nothing else.
 * `converted_to_paid` was read in three places and written in none, and
 * `is_pilot` stayed true forever. That was harmless while nothing enforced
 * the pilot lifecycle. Once the read-only gate became real
 * (lib/billing/access-model.ts), it became a live defect: a customer could pay
 * on day 20 and be frozen out on day 31, because accessLevel() still saw an
 * unconverted pilot whose window had closed.
 *
 * Both webhook paths call this. Checkout is not the only route to a paid
 * subscription — a plan change, a recovered payment, or a subscription created
 * outside checkout all arrive as customer.subscription.* events, and a
 * customer converting that way would otherwise stay a pilot.
 *
 * Idempotent by construction: every field is an absolute value, so a Stripe
 * retry writes the same row again with no effect. Deliberately NOT guarded on
 * current state (no `.eq('converted_to_paid', false)`), because a partially
 * applied earlier attempt must still be completed by the retry.
 *
 * pilot_end_date and pilot_start_date are left untouched. They are the
 * historical record of when the pilot ran and are shown on the admin screens;
 * clearing them would erase when a customer actually started.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface MarkConvertedArgs {
  /** Plan slug resolved from the Stripe price id, when known. */
  planSlug?: string | null
  /** Mapped subscription status, defaults to 'active'. */
  status?: string | null
}

/**
 * Flip an organization out of pilot state after a successful payment.
 *
 * Returns the error, if any, rather than throwing: a webhook must keep
 * processing and return 200 so Stripe does not retry forever on a partial
 * failure, and the caller logs.
 */
export async function markOrganizationConverted(
  supabase: SupabaseClient,
  organizationId: string,
  args: MarkConvertedArgs = {}
): Promise<{ error: string | null }> {
  const update: Record<string, unknown> = {
    // The two fields the access model reads. converted_to_paid alone would
    // restore write access, but leaving is_pilot true keeps the pilot banner
    // and countdown on screen for someone who has already paid.
    converted_to_paid: true,
    is_pilot: false,
    subscription_status: args.status || 'active',
  }

  // Only overwrite the tier when the price mapped to a known plan. Writing an
  // unknown slug would be worse than leaving the stale one.
  if (args.planSlug) update.subscription_tier = args.planSlug

  const { error } = await supabase
    .from('organizations')
    .update(update)
    .eq('id', organizationId)

  return { error: error ? error.message : null }
}

/** Stripe subscription statuses that mean the customer is genuinely paying. */
const PAYING_STATUSES = new Set(['active', 'trialing', 'past_due'])

/**
 * Whether a Stripe subscription status should convert the org.
 *
 * `trialing` counts: a Professional annual purchase carries a 90-day trial for
 * the 15-month service term (lib/billing/service-term.ts), so the customer has
 * paid even though Stripe reports trialing. Treating that as unpaid would lock
 * out exactly the customers who spent the most.
 *
 * `past_due` counts too: a failed renewal is a dunning problem, not grounds to
 * revoke access mid-cycle.
 */
export function isPayingStatus(stripeStatus: string | null | undefined): boolean {
  return !!stripeStatus && PAYING_STATUSES.has(stripeStatus)
}
