// lib/admin/featureFlags.ts
// Single source of truth for the platform-admin feature-flag allowlist.
//
// This list MUST stay in sync with v_allowed inside the SQL function
// public.set_feature_flag (supabase/migrations/20260605_platform_admin_phase2.sql).
// The SQL function is the authoritative gate (defense in depth); this
// constant drives the UI and the server-action pre-check so a bad flag is
// rejected before it ever reaches the database.

export interface AllowedFlag {
  key: string
  label: string
  description: string
}

export const ALLOWED_FLAGS: readonly AllowedFlag[] = [
  {
    key: 'beta_dashboard',
    label: 'Beta dashboard',
    description: 'Opt this org into the redesigned dashboard.',
  },
  {
    key: 'advanced_reports',
    label: 'Advanced reports',
    description: 'Enable the advanced reporting module.',
  },
  {
    key: 'bulk_export',
    label: 'Bulk export',
    description: 'Allow large multi-entity CSV exports.',
  },
] as const

export const ALLOWED_FLAG_KEYS: readonly string[] = ALLOWED_FLAGS.map((f) => f.key)

export function isAllowedFlag(flag: string): boolean {
  return ALLOWED_FLAG_KEYS.includes(flag)
}

// Allowed trial/pilot extension lengths (days). Mirrors the {7,14,30}
// allowlist enforced inside public.extend_trial.
export const ALLOWED_EXTEND_DAYS = [7, 14, 30] as const
export type ExtendDays = (typeof ALLOWED_EXTEND_DAYS)[number]

export function isAllowedExtendDays(days: number): days is ExtendDays {
  return (ALLOWED_EXTEND_DAYS as readonly number[]).includes(days)
}

// ---------------------------------------------------------------------------
// End-pilot modes.
//
// Mirrors the {'read_only','locked'} allowlist enforced inside
// public.end_pilot (supabase/migrations/20260827_admin_end_pilot.sql).
//
// The two modes are the two natural states of an expired pilot, not new
// ones: 'read_only' is the day-30 grace window, 'locked' is day 45+. See
// lib/billing/access-model.ts for why the grace window matters.
// ---------------------------------------------------------------------------
export const ALLOWED_END_MODES = ['read_only', 'locked'] as const
export type EndMode = (typeof ALLOWED_END_MODES)[number]

export function isAllowedEndMode(mode: string): mode is EndMode {
  return (ALLOWED_END_MODES as readonly string[]).includes(mode)
}

/** Human-readable consequence of each mode, for the confirmation UI. */
export const END_MODE_LABELS: Record<EndMode, { label: string; description: string }> = {
  read_only: {
    label: 'End now (read-only)',
    description:
      'Ends the pilot immediately. The org keeps read access to everything it built, but cannot write. This is the normal day-30 state.',
  },
  locked: {
    label: 'End and lock out',
    description:
      'Ends the pilot AND skips the grace period, locking the org out of everything except billing. For abuse or fraudulent signups.',
  },
}

// ---------------------------------------------------------------------------
// Plans a platform admin may assign when recording an off-Stripe payment.
//
// Mirrors subscription_plans.slug. The DB re-checks against the live table, so
// this list is the fast-fail copy, not the authority: if a plan is added there,
// add it here too or the admin UI will refuse it while the RPC would allow it.
// ---------------------------------------------------------------------------
export const ALLOWED_PLAN_SLUGS = [
  'starter',
  'professional',
  'business',
  'enterprise',
] as const
export type PlanSlug = (typeof ALLOWED_PLAN_SLUGS)[number]

export function isAllowedPlanSlug(slug: string): slug is PlanSlug {
  return (ALLOWED_PLAN_SLUGS as readonly string[]).includes(slug)
}
