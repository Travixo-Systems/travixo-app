// lib/admin/orgHealth.ts
// Derived, display-only signals for the platform-admin screens.
//
// Everything here is computed from columns this repo has CONFIRMED exist
// (types/database.ts + the migrations). Nothing invents a column, and
// nothing here makes an access decision -- lib/billing/access-model.ts
// remains the only authority on what an org may do. These helpers exist
// so the admin screens can answer "is this pilot alive, and is this
// button worth showing" without each page re-deriving it.
//
// WHERE "last connected" COMES FROM
//
// public.users has NO last-login column (id, email, full_name, first_name,
// last_name, organization_id, role, avatar_url, language, created_at,
// updated_at -- that is the whole row). The authoritative sign-in time
// lives in auth.users.last_sign_in_at, which PostgREST does not expose,
// so it is read via the Auth admin API with the service-role key. See
// lastConnectedFromAuthUsers() below.
//
// That call can fail or be unavailable. Every consumer must handle a null
// last-connected rather than rendering a misleading "never".

import {
  accessLevel,
  isPilotActive,
  daysSincePilotStart,
  PILOT_LOCKOUT_DAYS,
  type AccessLevel,
  type OrgAccessInput,
} from '@/lib/billing/access-model'

// ---------------------------------------------------------------------------
// canExtendPilot
// ---------------------------------------------------------------------------

/**
 * Whether extending this org's pilot can actually change anything.
 *
 * WHY THIS EXISTS
 *
 * accessLevel() returns 'locked' as soon as daysSincePilotStart exceeds
 * PILOT_LOCKOUT_DAYS, and that test is reached BEFORE pilot_end_date is
 * consulted. So extending a day-50 pilot writes a future pilot_end_date,
 * reports success, and leaves the customer locked out. The admin is told
 * one thing and the customer experiences another.
 *
 * Day 45 is a real deadline, not a suggestion -- a locked pilot SHOULD
 * stay locked. The defect is offering a control that cannot deliver, so
 * the fix is to stop offering it. This predicate is that gate.
 *
 * Returns false when:
 *   - the org is not a pilot        (extend_trial takes the trial branch;
 *                                    the pilot control is meaningless)
 *   - the org already converted     (a paying org has 'full' access; there
 *                                    is no pilot window left to extend)
 *   - the org is past lockout       (the extension would not be felt)
 */
export function canExtendPilot(org: OrgAccessInput): boolean {
  if (!org?.is_pilot) return false
  if (org.converted_to_paid) return false
  return accessLevel(org) !== 'locked'
}

/**
 * Why extending is unavailable, for the disabled control's explanation.
 * Returns null when extending IS available.
 */
export function extendUnavailableReason(org: OrgAccessInput): string | null {
  if (canExtendPilot(org)) return null
  if (!org?.is_pilot) return 'This organization is not on a pilot.'
  if (org.converted_to_paid) {
    return 'This organization already converted to paid — it has full access.'
  }
  const days = daysSincePilotStart(org.pilot_start_date)
  return (
    `This pilot passed the ${PILOT_LOCKOUT_DAYS}-day lockout ${days - PILOT_LOCKOUT_DAYS} day(s) ago. ` +
    'Extending would move the end date but the organization would stay locked out, ' +
    'so the extension would have no effect.'
  )
}

/** Whether the end-pilot control should be offered at all. */
export function canEndPilot(org: OrgAccessInput): boolean {
  if (!org?.is_pilot) return false
  if (org.converted_to_paid) return false
  // Already past lockout: there is nothing left to end.
  return accessLevel(org) !== 'locked'
}

// ---------------------------------------------------------------------------
// Last connected
// ---------------------------------------------------------------------------

export interface LastConnected {
  /** ISO timestamp of the most recent sign-in, or null if never/unknown. */
  at: string | null
  /** Whole days since that sign-in; null when `at` is null. */
  daysAgo: number | null
}

/** Whole days between an ISO timestamp and now. Null on bad input. */
export function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

/**
 * Reduce a set of auth users to the most recent sign-in.
 *
 * Pure, so it can be verified without network access. Pass the
 * `last_sign_in_at` values for the org's members.
 */
export function mostRecentSignIn(
  signIns: readonly (string | null | undefined)[]
): LastConnected {
  let best: number | null = null
  let bestIso: string | null = null
  for (const iso of signIns) {
    if (!iso) continue
    const t = new Date(iso).getTime()
    if (Number.isNaN(t)) continue
    if (best === null || t > best) {
      best = t
      bestIso = iso
    }
  }
  return { at: bestIso, daysAgo: bestIso ? daysAgo(bestIso) : null }
}

/**
 * Human label for a last-connected value.
 *
 * Distinguishes "we know they never signed in" from "we could not find
 * out", because on the admin screen those mean very different things.
 */
export function formatLastConnected(lc: LastConnected, known: boolean): string {
  if (!known) return 'unknown'
  if (!lc.at) return 'never'
  const d = lc.daysAgo
  if (d === null) return 'unknown'
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}

// ---------------------------------------------------------------------------
// Pilot health
// ---------------------------------------------------------------------------

export type EngagementLevel = 'active' | 'idle' | 'dormant' | 'never'

/**
 * How engaged an org looks, from its most recent sign-in.
 *
 * Thresholds are deliberately coarse: this is a triage hint for deciding
 * who to call, never an input to billing or access.
 *
 *   active  : signed in within the last 7 days
 *   idle    : 8-21 days
 *   dormant : 22+ days
 *   never   : no recorded sign-in
 */
export function engagementLevel(lc: LastConnected): EngagementLevel {
  if (!lc.at || lc.daysAgo === null) return 'never'
  if (lc.daysAgo <= 7) return 'active'
  if (lc.daysAgo <= 21) return 'idle'
  return 'dormant'
}

export interface OrgHealthInput extends OrgAccessInput {
  /** Real (non-demo) asset count for the org. */
  realAssets: number
  /** Demo/seeded asset count, excluded from the "did they adopt it" read. */
  demoAssets: number
  /** Number of member users. */
  userCount: number
  /** VGP inspections recorded by this org. */
  inspectionCount: number
  /** Most recent sign-in across the org's members. */
  lastConnected: LastConnected
}

export interface OrgHealth {
  access: AccessLevel
  pilotActive: boolean
  daysIn: number
  daysLeft: number | null
  engagement: EngagementLevel
  /** True when the org put real work in: own assets or inspections. */
  hasRealUsage: boolean
  /** Ranked 0-100. Higher = more likely to convert. Triage only. */
  score: number
  /** Short reasons behind the score, for the admin to read at a glance. */
  signals: string[]
}

/**
 * A conversion-triage summary for one org.
 *
 * The score is a blunt heuristic for SORTING a list, nothing more. It is
 * never persisted and never gates access. The `signals` array is the part
 * a human should actually read.
 */
export function orgHealth(input: OrgHealthInput): OrgHealth {
  const access = accessLevel(input)
  const pilotActive = isPilotActive(input)
  const daysIn = daysSincePilotStart(input.pilot_start_date)
  const engagement = engagementLevel(input.lastConnected)
  const hasRealUsage = input.realAssets > 0 || input.inspectionCount > 0

  let daysLeft: number | null = null
  if (input.is_pilot && input.pilot_end_date) {
    daysLeft = Math.ceil(
      (new Date(input.pilot_end_date).getTime() - Date.now()) / 86400000
    )
  }

  const signals: string[] = []
  let score = 0

  // Engagement is the strongest single signal: someone signing in is
  // someone evaluating.
  if (engagement === 'active') {
    score += 40
    signals.push('signed in recently')
  } else if (engagement === 'idle') {
    score += 20
    signals.push('has not signed in for over a week')
  } else if (engagement === 'dormant') {
    signals.push('dormant for 3+ weeks')
  } else {
    signals.push('never signed in')
  }

  // Real assets mean they imported their own fleet, the single best
  // predictor that the product fits.
  if (input.realAssets >= 20) {
    score += 30
    signals.push(`${input.realAssets} real assets imported`)
  } else if (input.realAssets > 0) {
    score += 15
    signals.push(`${input.realAssets} real asset(s)`)
  } else if (input.demoAssets > 0) {
    signals.push('demo data only — no real assets')
  } else {
    signals.push('no assets at all')
  }

  // Inspections mean they ran the actual VGP workflow.
  if (input.inspectionCount > 0) {
    score += 20
    signals.push(`${input.inspectionCount} VGP inspection(s) recorded`)
  }

  // More than one seat means it spread past the person who signed up.
  if (input.userCount > 1) {
    score += 10
    signals.push(`${input.userCount} users`)
  }

  if (input.is_pilot && daysLeft !== null && daysLeft <= 7 && daysLeft >= 0) {
    signals.push(`pilot ends in ${daysLeft}d — follow up now`)
  }
  if (access === 'read_only') signals.push('in read-only grace window')
  if (access === 'locked') signals.push('locked out')

  return {
    access,
    pilotActive,
    daysIn,
    daysLeft,
    engagement,
    hasRealUsage,
    score: Math.max(0, Math.min(100, score)),
    signals,
  }
}

