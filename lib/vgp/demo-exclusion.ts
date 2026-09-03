// lib/vgp/demo-exclusion.ts
//
// Two suppression rules shared by the VGP alert cron. They live here rather
// than inline in the route so they can be tested on their own, which matters:
// both are the kind of predicate that is easy to write backwards and whose
// failure is silent mail rather than an exception.

/**
 * A schedule row as the cron selects it, narrowed to the one field that
 * decides demo status. The embed is optional at the type level because
 * PostgREST returns `null` for an embedded row it cannot resolve.
 */
export interface DemoExclusionCandidate {
  assets?: { is_demo_data?: boolean | null } | null;
}

/**
 * True when this schedule hangs off a seeded demo asset.
 *
 * `assets.is_demo_data` is `boolean DEFAULT false` with NO NOT NULL, so rows
 * written before the column existed carry NULL. The test is therefore an
 * identity check against `true`, never a falsiness check and never
 * `!== false`: NULL and undefined mean "not known to be demo", which for real
 * customer equipment must resolve to KEEP.
 *
 * Failing open is deliberate. A demo asset that slips through sends one
 * unwanted email; a real overdue asset wrongly suppressed hides a compliance
 * breach that carries criminal liability (art. L4741-1). The asymmetry decides
 * the default.
 */
export function isDemoSchedule(candidate: DemoExclusionCandidate | null | undefined): boolean {
  return candidate?.assets?.is_demo_data === true;
}

/**
 * True when an address must never be handed to Resend.
 *
 * `.test` is reserved by RFC 2606 and cannot resolve, so every send to one is
 * a guaranteed hard bounce. scripts/seed-complete-test-data.ts creates five
 * such accounts per seeded org (`user{i}@{slug}.test`) as real rows in
 * `public.users` with owner/admin roles, which is exactly what
 * getAlertRecipients() selects. Left alone they bounce daily and the bounce
 * rate is charged against the sending domain's reputation.
 *
 * Matched on the label boundary, so `a@b.testing.fr` and `a@testbed.fr` are
 * left alone. Empty and missing addresses are suppressed too: there is no
 * legitimate send to one, and Resend rejects the whole batch if any recipient
 * is malformed, which would take the real recipients down with it.
 */
export function isUndeliverableEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return true;
  const normalized = email.trim().toLowerCase();
  if (normalized === '') return true;
  return normalized.endsWith('.test');
}
