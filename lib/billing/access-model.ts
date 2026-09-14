/**
 * The access model: one vocabulary, one place.
 *
 * ---------------------------------------------------------------------------
 * TRIAL vs PILOT — the distinction, because the codebase uses both words
 * ---------------------------------------------------------------------------
 *
 * They are the SAME THING here. There is one free period, and it is stored
 * twice:
 *
 *   organizations.pilot_start_date   when it began
 *   organizations.pilot_end_date     when full access ends
 *   organizations.trial_ends_at      a mirror of pilot_end_date
 *   organizations.is_pilot           whether the org is in the free period
 *
 * Measured on live data: trial_ends_at and pilot_end_date are identical for
 * every organization, always. `trial_ends_at` drives NO runtime logic — it is
 * read only by the admin screens for display. Every access decision reads
 * pilot_end_date.
 *
 * Treat "pilot" as the real name and "trial" as a legacy synonym. Prefer
 * pilot_* in new code. Do not add a decision that branches on trial_ends_at:
 * it would silently disagree with pilot_end_date the moment an admin extends
 * one and not the other.
 *
 *   organizations.subscription_tier is ALSO not a reliable signal. Older orgs
 *   carry 'trial'; orgs created since carry 'starter'; some pilots carry
 *   'professional'. It reflects which PLAN a pilot is sampling, never whether
 *   they have paid. `converted_to_paid` and a real Stripe subscription are the
 *   only proof of payment.
 *
 * ---------------------------------------------------------------------------
 * THE LIFECYCLE
 * ---------------------------------------------------------------------------
 *
 *   day 0  .. 30    'full'       everything works
 *   day 30 .. 45    'read_only'  the whole app is readable, no writes
 *   day 45+         'locked'     nothing but /settings/subscription
 *
 * The middle window is deliberate: a depot manager sees the fleet he built,
 * frozen, rather than a generic paywall. The felt loss is the point. That only
 * works if it is the WHOLE app — freezing VGP alone lets him keep operating
 * and removes the pressure.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE EXISTS
 * ---------------------------------------------------------------------------
 *
 * The read-only state used to live only in React hooks, so the pages rendered
 * as read-only while the API kept accepting writes. Anyone bypassing the UI
 * kept full access forever, including past lockout. The server is the only
 * place a write can actually be refused, so the decision belongs here, in code
 * both sides import.
 *
 * Note the DB function public.has_feature_access() answers a different
 * question — "does this plan include this feature" — and falls through to
 * `subscriptions.status IN ('active','trialing')` once a pilot ends. Nothing
 * flips that status on expiry, so it returns true indefinitely. It is a
 * FEATURE check, never a WRITE check. Do not use it to authorise a mutation.
 */

/** Days of full access from pilot_start_date. */
export const PILOT_FULL_DAYS = 30

/** Days of whole-app read-only access after the full window. */
export const PILOT_GRACE_DAYS = 15

/** Day at which an unconverted pilot loses everything. */
export const PILOT_LOCKOUT_DAYS = PILOT_FULL_DAYS + PILOT_GRACE_DAYS

/**
 * Assets a pilot may hold.
 *
 * This was 50, which was lower than every plan sold — Starter allows 100 and
 * Professional 500 — so a prospect evaluated TraviXO under the most
 * restrictive version of it. A depot with 200 machines would import 50, hit
 * the wall, and conclude the product did not fit a fleet Professional handles
 * four times over. Evaluation should never be the constraint.
 *
 * 400 sits above the point where a real fleet stops fitting, and below
 * Professional's 500 so converting still gains headroom.
 *
 * Hardcoded rather than read from the plan on purpose: during the pilot the
 * plan is not yet a constraint, and the two records of which plan an org sits
 * on currently disagree (organizations.subscription_tier says starter while
 * the subscriptions row points at professional). One number every pilot gets
 * is honest; a number derived from an unreliable field is not.
 */
export const PILOT_MAX_ASSETS = 400

export type AccessLevel = 'full' | 'read_only' | 'locked'

export interface OrgAccessInput {
  is_pilot?: boolean | null
  pilot_start_date?: string | null
  pilot_end_date?: string | null
  converted_to_paid?: boolean | null
  /**
   * subscriptions.licensed_capacity for this org: the Stripe subscription item
   * quantity, NULL when there is no Stripe subscription.
   *
   * Optional because most callers gate admin controls and pass an
   * organizations row alone. A caller that AUTHORISES A WRITE must supply it,
   * or a paying customer computes as though they had never subscribed. See
   * lib/server/require-write-access.ts, which joins it for exactly that reason.
   */
  licensed_capacity?: number | null
}

/** Whole days elapsed since the pilot began; 0 when unknown. */
export function daysSincePilotStart(pilotStartDate: string | null | undefined): number {
  if (!pilotStartDate) return 0
  const started = new Date(pilotStartDate).getTime()
  if (Number.isNaN(started)) return 0
  return Math.ceil((Date.now() - started) / (1000 * 60 * 60 * 24))
}

/**
 * True while the free period is running.
 *
 * Derived from pilot_end_date rather than a day count, so that extending a
 * single org from the admin screen takes effect without a code change. A NULL
 * end date means an unbounded pilot (used by internal/never-expire accounts).
 */
export function isPilotActive(org: OrgAccessInput): boolean {
  if (!org?.is_pilot) return false
  const now = Date.now()
  if (org.pilot_start_date && now < new Date(org.pilot_start_date).getTime()) return false
  if (!org.pilot_end_date) return true
  return now <= new Date(org.pilot_end_date).getTime()
}

/**
 * The org's access level.
 *
 * `is_pilot = false` used to short-circuit to 'full', on the assumption that a
 * non-pilot was either a paying customer or an account this model never
 * governed. Under capacity pricing that assumption broke: an org whose pilot
 * was ended administratively carries is_pilot = false with no subscription
 * behind it, and so computed as a paying customer forever. Measured on live
 * data, three organizations were in exactly that state, with no asset ceiling
 * and no write gate.
 *
 * So evidence of payment is now what grants 'full', not the absence of a pilot
 * flag. Two things count, and both are things that only exist once money has
 * moved:
 *
 *   converted_to_paid    set by the Stripe webhook on a real payment event
 *   licensed_capacity    the Stripe subscription item quantity
 *
 * Everything else -- an expired pilot that never converted, a non-pilot with
 * no subscription -- takes the SAME read_only/locked path an expired pilot has
 * always taken. No fourth level, no new vocabulary.
 *
 * A caller that omits licensed_capacity (most admin screens pass an
 * organizations row alone) still gets the right answer for a converted org,
 * because converted_to_paid is checked independently.
 */
export function accessLevel(org: OrgAccessInput): AccessLevel {
  // Proof of payment, in either form. Checked before the pilot flag so it
  // holds for a converted pilot and a non-pilot subscriber alike.
  if (org?.converted_to_paid) return 'full'
  if (org?.licensed_capacity != null) return 'full'

  // A running pilot has full access on its own terms.
  if (isPilotActive(org)) return 'full'

  // Everything remaining degrades on the existing schedule. For a non-pilot
  // with no pilot_start_date, daysSincePilotStart returns 0, which is <=
  // PILOT_LOCKOUT_DAYS and therefore 'read_only' rather than 'locked': an
  // account with no history is frozen, not locked out.
  return daysSincePilotStart(org?.pilot_start_date) > PILOT_LOCKOUT_DAYS
    ? 'locked'
    : 'read_only'
}

/** True when the org may perform a mutating request. */
export function canWrite(org: OrgAccessInput): boolean {
  return accessLevel(org) === 'full'
}

/** True when the org may read at all. Only a locked org may not. */
export function canRead(org: OrgAccessInput): boolean {
  return accessLevel(org) !== 'locked'
}

/** Days until the read-only window begins; negative once it has. */
export function daysUntilReadOnly(org: OrgAccessInput): number | null {
  if (!org?.is_pilot || !org.pilot_end_date) return null
  return Math.ceil((new Date(org.pilot_end_date).getTime() - Date.now()) / 86400000)
}

/** Machine-readable reason for a refused write, for the API response body. */
export function writeDenialReason(org: OrgAccessInput): 'pilot_read_only' | 'account_locked' | null {
  const level = accessLevel(org)
  if (level === 'read_only') return 'pilot_read_only'
  if (level === 'locked') return 'account_locked'
  return null
}
