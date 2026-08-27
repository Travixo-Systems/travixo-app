/**
 * Pilot / trial window.
 *
 * Single source of truth for how long a pilot lasts and how long the
 * read-only grace period runs afterwards. These numbers were previously
 * duplicated as bare `30`s in lib/billing/entitlements.ts and
 * app/api/subscriptions/route.ts, which is how the backend drifted to 15 days
 * while the marketing site advertised 30.
 *
 * The shape of a pilot:
 *
 *   day 0 ............ 30      full access
 *   day 30 ........... 45      read-only VGP (grace)
 *   day 45+                    account locked
 *
 * The 30-day figure has to match what travixosystems.com advertises. If it
 * changes, change it here and nowhere else, then update the marketing site.
 *
 * The database sets pilot_end_date at signup (public.create_organization_and_user),
 * so PILOT_FULL_DAYS must stay in step with the INTERVAL in that function. The
 * migration that owns it is supabase/migrations/20260827_trial_30_days.sql.
 */

/** Days of full access from pilot_start_date. Must match the DB interval. */
export const PILOT_FULL_DAYS = 30

/** Days of read-only VGP access after the full window ends. */
export const PILOT_GRACE_DAYS = 15

/** Day count at which an unconverted pilot is locked out entirely. */
export const PILOT_LOCKOUT_DAYS = PILOT_FULL_DAYS + PILOT_GRACE_DAYS

/**
 * Whole days elapsed since a pilot started. Returns 0 when there is no start
 * date, which keeps a missing date from reading as "long expired".
 */
export function daysSincePilotStart(pilotStartDate: string | null | undefined): number {
  if (!pilotStartDate) return 0
  const started = new Date(pilotStartDate).getTime()
  if (Number.isNaN(started)) return 0
  return Math.ceil((Date.now() - started) / (1000 * 60 * 60 * 24))
}

/**
 * An unconverted pilot is locked once it is past the full window AND past the
 * grace period. `pilotActive` is derived from pilot_end_date rather than
 * recomputed here, so an admin who extends a single org's end date keeps that
 * org active without needing a code change.
 */
export function isAccountLocked(args: {
  isPilot: boolean
  pilotActive: boolean
  convertedToPaid: boolean
  pilotStartDate: string | null | undefined
}): boolean {
  const { isPilot, pilotActive, convertedToPaid, pilotStartDate } = args
  if (!isPilot || pilotActive || convertedToPaid) return false
  return daysSincePilotStart(pilotStartDate) > PILOT_LOCKOUT_DAYS
}
