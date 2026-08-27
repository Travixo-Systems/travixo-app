/**
 * What a pilot has that a given plan does not.
 *
 * During the pilot every feature is unlocked: public.has_feature_access()
 * returns TRUE unconditionally while the pilot window is open, regardless of
 * which plan the organization is nominally on. subscription_tier during a
 * pilot is a label for the plan they would fall back to, not a set of limits
 * being applied.
 *
 * That creates a cliff nobody is warned about. Starter does NOT include
 * vgp_compliance. A depot manager can run VGP inspections for 30 days, buy
 * Starter at EUR 490, and find the compliance module — the reason they came —
 * behind an upgrade wall. They would reasonably feel mis-sold.
 *
 * This computes the difference so the billing page can name it before the
 * purchase rather than after. It is a disclosure, not an entitlement change:
 * nothing here alters what any plan grants.
 *
 * Driven by the plan's own `features` object rather than a hardcoded check on
 * the Starter slug, so adding a plan, or adding VGP to Starter, changes the
 * warning automatically instead of leaving a stale one behind.
 */

/**
 * Features whose loss is material enough to warn about before purchase.
 *
 * digital_audits is deliberately absent. Live plan data carries it as
 * "on_demand" on Business and Enterprise and omits it entirely on Starter and
 * Professional, so it is negotiated rather than bundled. Listing it as "not
 * included" would be wrong on every card, and warning on all four plans would
 * turn a specific caution into noise the buyer learns to skip.
 */
const MATERIAL_FEATURES = [
  'vgp_compliance',
  'rental_management',
  'multi_location',
  'vgp_email_alerts',
] as const

export type MaterialFeature = (typeof MATERIAL_FEATURES)[number]

export interface PlanLike {
  slug?: string | null
  features?: Record<string, unknown> | null
}

/**
 * Material features the pilot currently grants that `plan` does not.
 *
 * Returns an empty array when the plan covers everything material, so a
 * caller can render nothing rather than an empty warning box.
 */
export function featuresLostOnPlan(plan: PlanLike | null | undefined): MaterialFeature[] {
  if (!plan) return []
  const features = plan.features || {}
  return MATERIAL_FEATURES.filter((key) => {
    const value = features[key]
    // A feature is "lost" only when the plan genuinely does not carry it.
    // Plan data uses three states: true (included), the string "on_demand"
    // (negotiated, not a flat no), and absent/false (not included). Treating
    // "on_demand" as lost would tell a Business buyer they cannot have
    // something their contract can in fact include.
    if (value === true) return false
    if (typeof value === 'string' && value !== 'false') return false
    return true
  })
}

/**
 * Whether buying this plan would visibly remove something the pilot has.
 * Only meaningful while the organization is still a pilot.
 */
export function planRemovesPilotFeatures(
  plan: PlanLike | null | undefined,
  isPilot: boolean
): boolean {
  return isPilot && featuresLostOnPlan(plan).length > 0
}
