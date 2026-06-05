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
