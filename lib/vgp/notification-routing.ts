// lib/vgp/notification-routing.ts
//
// Per-recipient delivery decisions for VGP alerts.
//
// Everything here is pure: no database, no clock, no email. The cron reads
// rows and sends mail; this module decides who gets what. That split exists
// because the decisions are the part with real edge cases -- an absent
// preference row, a threshold array that excludes a band, a stored value that
// no longer passes the CHECK -- and none of them are observable in a cron whose
// output is "an email was sent to someone, somewhere, or not".

/** Delivery cadence a user has chosen for VGP alerts. */
export type VGPFrequency = 'immediate' | 'daily_digest' | 'weekly_digest' | 'off';

export const VGP_FREQUENCIES: readonly VGPFrequency[] = [
  'immediate',
  'daily_digest',
  'weekly_digest',
  'off',
] as const;

/**
 * Threshold values a user may enable, expressed as FREQUENCY_RULES.preferenceDay.
 *
 * 0 is overdue and is a real, togglable threshold here. The org-level `timing`
 * array never contained it -- the cron special-cased overdue as always-on -- so
 * a user opting out of overdue mail is new capability, not a port.
 */
export const VGP_THRESHOLDS: readonly number[] = [30, 15, 7, 1, 0] as const;

export const DEFAULT_FREQUENCY: VGPFrequency = 'daily_digest';
export const DEFAULT_THRESHOLDS: readonly number[] = VGP_THRESHOLDS;

/** A row from user_notification_preferences, as stored. */
export interface UserNotificationPreferenceRow {
  user_id: string;
  organization_id: string;
  vgp_frequency: string | null;
  vgp_thresholds: number[] | null;
}

/** Org-level settings, already normalised out of the JSONB column. */
export interface OrgAlertDefaults {
  /** organizations.notification_preferences -> vgp_alerts.timing */
  timing: number[];
  /** False when the org has disabled email or VGP alerts wholesale. */
  enabled: boolean;
}

/** What the cron needs to know about one recipient. */
export interface ResolvedRecipientPreference {
  frequency: VGPFrequency;
  thresholds: number[];
  /** True when the values came from a user row rather than org defaults. */
  fromUserRow: boolean;
}

function isValidFrequency(value: unknown): value is VGPFrequency {
  return typeof value === 'string' && (VGP_FREQUENCIES as readonly string[]).includes(value);
}

/**
 * Normalise a threshold array read from the database.
 *
 * Values outside the known set are dropped rather than passed through: they
 * cannot match any band's preferenceDay, so keeping them would only make a
 * "why did nothing send" investigation longer. An array that normalises to
 * empty is treated as absent, because a user who has enabled no thresholds at
 * all almost certainly means "off" -- and if they truly mean it, `off` says so
 * explicitly and is not silently equivalent to a corrupted array.
 */
function normalizeThresholds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const kept = value.filter(
    (n): n is number => typeof n === 'number' && Number.isInteger(n) && VGP_THRESHOLDS.includes(n)
  );
  const unique = [...new Set(kept)].sort((a, b) => b - a);
  return unique.length > 0 ? unique : null;
}

/**
 * Decide one recipient's delivery settings.
 *
 * Precedence is per-FIELD, not per-row. A row whose vgp_frequency is valid but
 * whose vgp_thresholds is corrupt keeps the frequency and falls back only on
 * thresholds -- discarding the whole row would silently revert a choice the
 * user did make. The database CHECK and NOT NULL make both fields sound at
 * rest; this function stays defensive because it also runs against rows written
 * before those constraints, and against anything a future migration leaves
 * half-converted.
 *
 * Org-level `enabled = false` wins over everything. That switch is the org's
 * decision about its own mail, and a per-user preference cannot re-enable it.
 */
export function resolveRecipientPreference(
  row: UserNotificationPreferenceRow | null | undefined,
  orgDefaults: OrgAlertDefaults
): ResolvedRecipientPreference {
  if (!orgDefaults.enabled) {
    return { frequency: 'off', thresholds: [], fromUserRow: false };
  }

  const orgThresholds = normalizeThresholds(orgDefaults.timing) ?? [...DEFAULT_THRESHOLDS];

  if (!row) {
    return {
      frequency: DEFAULT_FREQUENCY,
      thresholds: orgThresholds,
      fromUserRow: false,
    };
  }

  const frequency = isValidFrequency(row.vgp_frequency) ? row.vgp_frequency : DEFAULT_FREQUENCY;
  const thresholds = normalizeThresholds(row.vgp_thresholds) ?? orgThresholds;

  return { frequency, thresholds, fromUserRow: true };
}

/**
 * Whether a band applies for this recipient.
 *
 * `preferenceDay` is the band's identity in the preference vocabulary, NOT the
 * number of days remaining: the critical band spans days 0-6 and identifies as
 * 1, the urgent band spans 7-14 and identifies as 7. A user unchecking "7
 * jours" therefore silences the whole 7-14 window, which is the intended
 * meaning of the checkbox.
 */
export function isThresholdEnabled(preferenceDay: number, thresholds: number[]): boolean {
  return thresholds.includes(preferenceDay);
}

/** One band's worth of alerts destined for a single recipient. */
export interface PendingAlertGroup<T> {
  /** FREQUENCY_RULES.preferenceDay for the band. */
  preferenceDay: number;
  alertType: string;
  urgencyLevel: string;
  items: T[];
}

/** What the cron should do for one recipient, after all filtering. */
export interface DeliveryPlan<T> {
  /** Send each group as its own email, preserving today's per-band behaviour. */
  immediate: PendingAlertGroup<T>[];
  /** Merge these into a single daily digest email. */
  dailyDigest: PendingAlertGroup<T>[];
  /** Persist these for the Monday weekly run. */
  weeklyPending: PendingAlertGroup<T>[];
  /** Groups dropped because the recipient disabled that threshold. */
  skippedByThreshold: PendingAlertGroup<T>[];
  /** True when the recipient receives nothing at all this run. */
  silent: boolean;
}

/**
 * Turn a recipient's resolved preference into concrete delivery instructions.
 *
 * Threshold filtering happens BEFORE the frequency split, so an "off" user and
 * a user who disabled every relevant threshold both end up silent by the same
 * path, and `skippedByThreshold` reports why rather than leaving a silent run
 * unexplained.
 */
export function planDelivery<T>(
  groups: PendingAlertGroup<T>[],
  preference: ResolvedRecipientPreference
): DeliveryPlan<T> {
  const empty: DeliveryPlan<T> = {
    immediate: [],
    dailyDigest: [],
    weeklyPending: [],
    skippedByThreshold: [],
    silent: true,
  };

  if (preference.frequency === 'off') {
    // Nothing is reported as threshold-skipped here: the user turned alerts
    // off outright, which is a different fact from a band being disabled.
    return empty;
  }

  const eligible: PendingAlertGroup<T>[] = [];
  const skipped: PendingAlertGroup<T>[] = [];

  for (const group of groups) {
    if (group.items.length === 0) continue;
    if (isThresholdEnabled(group.preferenceDay, preference.thresholds)) {
      eligible.push(group);
    } else {
      skipped.push(group);
    }
  }

  const plan: DeliveryPlan<T> = {
    immediate: [],
    dailyDigest: [],
    weeklyPending: [],
    skippedByThreshold: skipped,
    silent: eligible.length === 0,
  };

  if (eligible.length === 0) return plan;

  switch (preference.frequency) {
    case 'immediate':
      plan.immediate = eligible;
      break;
    case 'daily_digest':
      plan.dailyDigest = eligible;
      break;
    case 'weekly_digest':
      plan.weeklyPending = eligible;
      break;
  }

  return plan;
}

/** Total alert items across a set of groups. Used for subject-line counts. */
export function countItems<T>(groups: PendingAlertGroup<T>[]): number {
  return groups.reduce((n, g) => n + g.items.length, 0);
}

/**
 * Normalise organizations.notification_preferences -> vgp_alerts.recipients.
 *
 * The column carries two shapes. The DB default writes an ARRAY (`["owner"]`),
 * while the settings API validates and writes a STRING (`"owner"`). The cron
 * read it as a scalar and switched on string equality, so an array matched no
 * case and fell through to the owner-only default -- which happened to be right
 * for `["owner"]` and silently wrong for `["admin"]` and `["all"]`, quietly
 * narrowing those orgs' recipient lists.
 *
 * Takes the first element of an array, per the same rule the settings UI
 * already applies in normalizeNotificationData().
 */
export function normalizeRecipientsPref(value: unknown): 'owner' | 'admin' | 'all' {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'admin' || raw === 'all' ? raw : 'owner';
}
