// lib/admin/orgDetail.ts
// Live reads behind /admin/orgs/[id]. One module so a metric has one
// definition, not three that quietly disagree.
//
// EVERY READ IS RLS-SCOPED
//
// These take the caller's Supabase client, which on an admin page is the
// cookie-bound ANON client from lib/supabase/server.ts. Not service-role.
// They return rows only because of the super_admin_* SELECT policies added in
// 4a06175. Without those, every count below silently returns zero -- the exact
// failure that made /admin/evidence render a green all-clear over 733 live
// inspections.
//
// COUNTING
//
// Counts use { count: 'exact', head: true }. PostgREST caps a response at 1000
// rows, so counting a returned array reports 1000 for a table holding 20697
// and looks entirely reasonable while being wrong by a factor of twenty.
//
// FAILURE IS NOT ZERO
//
// Every result carries `failed`. A panel must render a failure state rather
// than a zero when its read could not run, because "nothing here" and "I could
// not look" are different facts and only one of them is reassuring.

import type { SupabaseClient } from '@supabase/supabase-js'

const DAY = 86400000

/** Comparison window for every delta on this page. */
export const DELTA_WINDOW_DAYS = 30

/** Chunk size for .in() lookups; PostgREST has a practical URL length limit. */
const CHUNK = 200

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString()
}

async function countRows(
  supabase: SupabaseClient,
  table: string,
  refine?: (q: any) => any
): Promise<{ count: number; error: string | null }> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true })
  if (refine) query = refine(query)
  const { count, error } = await query
  return { count: count ?? 0, error: error?.message ?? null }
}

// ---------------------------------------------------------------------------
// Chaine TraviXO
// ---------------------------------------------------------------------------

export type LegKey = 'identity' | 'movement' | 'compliance' | 'evidence'

export interface ChainLeg {
  key: LegKey
  /** Numerator: the rows that satisfy the leg. */
  met: number
  /** Denominator: the population the leg runs over. */
  total: number
  /** met/total as a percentage, or null when total is 0. */
  pct: number | null
  /** True once the leg clears its bar. Null when there is nothing to judge. */
  good: boolean | null
  failed: boolean
  error: string | null
}

export interface ChainResult {
  legs: ChainLeg[]
  failed: boolean
  error: string | null
}

/** A leg is "Bon" at or above this share. Below it reads "A completer". */
const LEG_GOOD_AT = 0.8

function leg(
  key: LegKey,
  met: number,
  total: number,
  error: string | null
): ChainLeg {
  const pct = total > 0 ? Math.round((met / total) * 100) : null
  return {
    key,
    met,
    total,
    pct,
    good: total === 0 ? null : met / total >= LEG_GOOD_AT,
    failed: Boolean(error),
    error,
  }
}

/**
 * The four legs, each from a live query.
 *
 * IDENTITY, AND WHY IT IS NOT "assets with a QR code"
 *
 * The brief specifies assets-with-a-QR / total assets. That ratio cannot fail:
 * assets.qr_code is `character varying(255) NOT NULL` with a UNIQUE
 * constraint, so every asset that exists has one. Measured live: 2732 of 2732
 * non-null, zero nulls, in every organization. It would render 100% for a
 * thriving depot and 100% for an account that has never been opened, which is
 * a decoration rather than a measurement.
 *
 * What the leg is actually asking is whether the QR estate is IN USE -- does
 * identity reach the field. Two candidates were measured:
 *
 *   assets.last_seen_at set     9 of 2732 globally. Structurally near-zero;
 *                               it would read as a red light everywhere.
 *   distinct assets scanned     discriminates: EuroRent 310/520, ZANAX 1/40,
 *                               the two loadtest orgs 0/1000.
 *
 * So Identity is scan coverage: distinct assets carrying at least one row in
 * public.scans, over total assets. The label says so on the page; this is a
 * substitution, not the brief's query, and the reader is told which.
 *
 * scans has no organization_id. Tenant scope runs through assets, which is
 * also how its own RLS policy is written (scans_select_same_org EXISTS-joins
 * assets), so the chunked .in() below matches the policy's own shape.
 */
export async function fetchChain(
  supabase: SupabaseClient,
  orgId: string
): Promise<ChainResult> {
  const today = new Date().toISOString().slice(0, 10)

  // --- Identity: distinct assets ever scanned / total assets --------------
  const { data: assetIdRows, error: assetIdErr } = await supabase
    .from('assets')
    .select('id')
    .eq('organization_id', orgId)

  const assetIds = ((assetIdRows as { id: string }[] | null) ?? []).map((a) => a.id)

  let scannedAssets = 0
  let identityError = assetIdErr?.message ?? null
  if (!identityError && assetIds.length > 0) {
    const seen = new Set<string>()
    for (const part of chunk(assetIds, CHUNK)) {
      const { data, error } = await supabase
        .from('scans')
        .select('asset_id')
        .in('asset_id', part)
      if (error) {
        identityError = error.message
        break
      }
      for (const s of (data as { asset_id: string | null }[] | null) ?? []) {
        if (s.asset_id) seen.add(s.asset_id)
      }
    }
    scannedAssets = seen.size
  }

  // --- Movement: rentals with BOTH checkout and return recorded ----------
  // A rental that went out and came back is a complete movement record. One
  // still open is not a defect, so this reads as progress, not compliance.
  const rentalsTotal = await countRows(supabase, 'rentals', (q) =>
    q.eq('organization_id', orgId)
  )
  const rentalsTraced = await countRows(supabase, 'rentals', (q) =>
    q
      .eq('organization_id', orgId)
      .not('checkout_date', 'is', null)
      .not('actual_return_date', 'is', null)
  )

  // --- Compliance: schedules whose next due date is still ahead ----------
  const schedulesTotal = await countRows(supabase, 'vgp_schedules', (q) =>
    q.eq('organization_id', orgId)
  )
  const schedulesCurrent = await countRows(supabase, 'vgp_schedules', (q) =>
    q.eq('organization_id', orgId).gte('next_due_date', today)
  )

  // --- Evidence: inspections carrying a certificate ----------------------
  const inspectionsTotal = await countRows(supabase, 'vgp_inspections', (q) =>
    q.eq('organization_id', orgId)
  )
  const inspectionsCertified = await countRows(supabase, 'vgp_inspections', (q) =>
    q.eq('organization_id', orgId).not('certificate_url', 'is', null)
  )

  const legs: ChainLeg[] = [
    leg('identity', scannedAssets, assetIds.length, identityError),
    leg(
      'movement',
      rentalsTraced.count,
      rentalsTotal.count,
      rentalsTraced.error ?? rentalsTotal.error
    ),
    leg(
      'compliance',
      schedulesCurrent.count,
      schedulesTotal.count,
      schedulesCurrent.error ?? schedulesTotal.error
    ),
    leg(
      'evidence',
      inspectionsCertified.count,
      inspectionsTotal.count,
      inspectionsCertified.error ?? inspectionsTotal.error
    ),
  ]

  const firstError = legs.find((l) => l.error)?.error ?? null
  return { legs, failed: Boolean(firstError), error: firstError }
}

// ---------------------------------------------------------------------------
// Usage reel
// ---------------------------------------------------------------------------

export interface UsageMetric {
  key: string
  value: number
  /** Rows created in the last window. Null when the table has no created_at. */
  current: number | null
  /** Rows created in the window before it. Null likewise. */
  prior: number | null
}

export interface UsageResult {
  metrics: UsageMetric[]
  /** Distinct non-empty assets.current_location values. */
  sites: number
  failed: boolean
  error: string | null
}

/**
 * Six usage figures, four of them with a period delta.
 *
 * Deltas are two ABSOLUTE counts, never a percentage. Measured live, the prior
 * 30-day window is zero for most entities on most organizations, and a
 * percentage over a zero base is either a division by zero or an invented
 * "+100%". The page labels both windows.
 *
 * SITES IS NOT A TABLE
 *
 * There is no sites/depots/locations relation in the schema. The nearest live
 * source is assets.current_location, free text, which holds 7 distinct values
 * for the largest organization ("Depot Rungis", "Chantier Issy", ...). It is
 * counted here and labelled as distinct locations rather than as a site
 * registry, because that is what it is.
 *
 * SCANS AND CERTIFICATES HAVE NO created_at PER ORG
 *
 * scans carries scanned_at and no organization_id; certificates are a column
 * on vgp_inspections rather than rows. Both report a total with a null delta,
 * and the page omits the delta line rather than printing a zero that would
 * read as "no activity".
 */
export async function fetchUsage(
  supabase: SupabaseClient,
  orgId: string
): Promise<UsageResult> {
  const boundary = daysAgoIso(DELTA_WINDOW_DAYS)
  const priorBoundary = daysAgoIso(DELTA_WINDOW_DAYS * 2)

  const withDelta = async (
    key: string,
    table: string,
    base: (q: any) => any
  ): Promise<{ metric: UsageMetric; error: string | null }> => {
    const total = await countRows(supabase, table, base)
    const current = await countRows(supabase, table, (q) =>
      base(q).gte('created_at', boundary)
    )
    const prior = await countRows(supabase, table, (q) =>
      base(q).gte('created_at', priorBoundary).lt('created_at', boundary)
    )
    return {
      metric: { key, value: total.count, current: current.count, prior: prior.count },
      error: total.error ?? current.error ?? prior.error,
    }
  }

  const errors: (string | null)[] = []

  const assets = await withDelta('assets', 'assets', (q) =>
    q.eq('organization_id', orgId)
  )
  errors.push(assets.error)

  const activeRentals = await withDelta('activeRentals', 'rentals', (q) =>
    q.eq('organization_id', orgId).eq('status', 'active')
  )
  errors.push(activeRentals.error)

  const alerts = await withDelta('alerts', 'vgp_alerts', (q) =>
    q.eq('organization_id', orgId)
  )
  errors.push(alerts.error)

  // Certificates: a column, not a table. Total only.
  const certificates = await countRows(supabase, 'vgp_inspections', (q) =>
    q.eq('organization_id', orgId).not('certificate_url', 'is', null)
  )
  errors.push(certificates.error)

  // Scans: no organization_id, so scope through this org's assets.
  const { data: assetIdRows, error: assetIdErr } = await supabase
    .from('assets')
    .select('id, current_location')
    .eq('organization_id', orgId)
  errors.push(assetIdErr?.message ?? null)

  const assetRows =
    (assetIdRows as { id: string; current_location: string | null }[] | null) ?? []
  const assetIds = assetRows.map((a) => a.id)

  const siteSet = new Set<string>()
  for (const a of assetRows) {
    const v = (a.current_location ?? '').trim()
    if (v) siteSet.add(v)
  }

  let scanTotal = 0
  for (const part of chunk(assetIds, CHUNK)) {
    const { count, error } = await supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .in('asset_id', part)
    if (error) {
      errors.push(error.message)
      break
    }
    scanTotal += count ?? 0
  }

  const firstError = errors.find((e) => e) ?? null

  return {
    metrics: [
      assets.metric,
      activeRentals.metric,
      { key: 'scans', value: scanTotal, current: null, prior: null },
      { key: 'certificates', value: certificates.count, current: null, prior: null },
      alerts.metric,
    ],
    sites: siteSet.size,
    failed: Boolean(firstError),
    error: firstError,
  }
}

// ---------------------------------------------------------------------------
// Facturation
// ---------------------------------------------------------------------------

export interface BillingResult {
  /** subscriptions.licensed_capacity. NULL means no subscription, never zero. */
  licensedCapacity: number | null
  billingCycle: string | null
  currentPeriodEnd: string | null
  status: string | null
  /** NULL means this subscription never came from Stripe. */
  stripeSubscriptionId: string | null
  /** Most recent billing_events row for this org, if any. */
  lastEvent: { eventType: string; createdAt: string; stripeEventId: string | null } | null
  /** True when there is no subscriptions row at all. */
  absent: boolean
  failed: boolean
  error: string | null
}

export async function fetchBilling(
  supabase: SupabaseClient,
  orgId: string
): Promise<BillingResult> {
  const empty = (error: string | null, absent: boolean): BillingResult => ({
    licensedCapacity: null,
    billingCycle: null,
    currentPeriodEnd: null,
    status: null,
    stripeSubscriptionId: null,
    lastEvent: null,
    absent,
    failed: Boolean(error),
    error,
  })

  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      'licensed_capacity, billing_cycle, current_period_end, status, stripe_subscription_id'
    )
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) return empty(error.message, false)
  if (!data) return empty(null, true)

  const sub = data as {
    licensed_capacity: number | null
    billing_cycle: string | null
    current_period_end: string | null
    status: string | null
    stripe_subscription_id: string | null
  }

  const { data: events } = await supabase
    .from('billing_events')
    .select('event_type, created_at, stripe_event_id')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)

  const ev = ((events as { event_type: string; created_at: string; stripe_event_id: string | null }[] | null) ?? [])[0]

  return {
    licensedCapacity: sub.licensed_capacity,
    billingCycle: sub.billing_cycle,
    currentPeriodEnd: sub.current_period_end,
    status: sub.status,
    stripeSubscriptionId: sub.stripe_subscription_id,
    lastEvent: ev
      ? { eventType: ev.event_type, createdAt: ev.created_at, stripeEventId: ev.stripe_event_id }
      : null,
    absent: false,
    failed: false,
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Points d'attention
// ---------------------------------------------------------------------------

export type AttentionKind =
  | 'overdue_schedules'
  | 'over_capacity'
  | 'rental_outlives_vgp'
  | 'no_recent_signin'
  | 'inspections_without_certificate'

export interface AttentionItem {
  kind: AttentionKind
  /** The measured figure behind the exception. */
  count: number
  /** Extra context, already resolved (a date, a capacity pair). */
  detail: string | null
}

export interface AttentionResult {
  items: AttentionItem[]
  /** Checks that ran and found nothing, so a clean panel can name them. */
  checked: AttentionKind[]
  failed: boolean
  error: string | null
}

/** Days without a sign-in before an organization counts as unattended. */
const STALE_SIGNIN_DAYS = 7

/**
 * Real exceptions only.
 *
 * Each entry is a condition someone would act on, measured now. A check that
 * finds nothing is recorded in `checked` so the panel can say what it looked
 * at: "no exception" is only reassuring when the reader can see the list.
 */
export async function fetchAttention(
  supabase: SupabaseClient,
  orgId: string,
  input: {
    assetCount: number
    licensedCapacity: number | null
    /** Days since the most recent sign-in across members; null when unknown. */
    daysSinceSignIn: number | null
    /** Whether the sign-in index could be read at all. */
    signInKnown: boolean
  }
): Promise<AttentionResult> {
  const today = new Date().toISOString().slice(0, 10)
  const items: AttentionItem[] = []
  const checked: AttentionKind[] = []
  const errors: (string | null)[] = []

  // 1. Schedules already past their due date.
  const overdue = await countRows(supabase, 'vgp_schedules', (q) =>
    q.eq('organization_id', orgId).lt('next_due_date', today)
  )
  errors.push(overdue.error)
  if (!overdue.error) {
    if (overdue.count > 0) {
      items.push({ kind: 'overdue_schedules', count: overdue.count, detail: null })
    } else {
      checked.push('overdue_schedules')
    }
  }

  // 2. Assets beyond the licensed capacity. Only meaningful with a licence:
  //    a pilot has no capacity to exceed.
  if (input.licensedCapacity != null) {
    if (input.assetCount > input.licensedCapacity) {
      items.push({
        kind: 'over_capacity',
        count: input.assetCount - input.licensedCapacity,
        detail: `${input.assetCount} / ${input.licensedCapacity}`,
      })
    } else {
      checked.push('over_capacity')
    }
  }

  // 3. Inspections with no certificate. The DREETS-facing gap.
  const uncertified = await countRows(supabase, 'vgp_inspections', (q) =>
    q.eq('organization_id', orgId).is('certificate_url', null)
  )
  errors.push(uncertified.error)
  if (!uncertified.error) {
    if (uncertified.count > 0) {
      items.push({
        kind: 'inspections_without_certificate',
        count: uncertified.count,
        detail: null,
      })
    } else {
      checked.push('inspections_without_certificate')
    }
  }

  // 4. Active rentals whose asset falls due for VGP before it is due back.
  //    The machine goes non-conformant on a customer site, where nobody can
  //    inspect it. Same rule as the evidence page's D3.
  const { data: rentalRows, error: rentalErr } = await supabase
    .from('rentals')
    .select('id, asset_id, expected_return_date')
    .eq('organization_id', orgId)
    .eq('status', 'active')
  errors.push(rentalErr?.message ?? null)

  if (!rentalErr) {
    const rentals =
      (rentalRows as { id: string; asset_id: string; expected_return_date: string | null }[] | null) ??
      []
    const withReturn = rentals.filter((r) => r.expected_return_date)
    const assetIds = [...new Set(withReturn.map((r) => r.asset_id))]

    const dueByAsset = new Map<string, string>()
    for (const part of chunk(assetIds, CHUNK)) {
      const { data, error } = await supabase
        .from('vgp_schedules')
        .select('asset_id, next_due_date, archived_at')
        .in('asset_id', part)
      if (error) {
        errors.push(error.message)
        break
      }
      for (const s of (data as { asset_id: string | null; next_due_date: string; archived_at: string | null }[] | null) ?? []) {
        if (s.archived_at || !s.asset_id) continue
        const held = dueByAsset.get(s.asset_id)
        if (!held || s.next_due_date < held) dueByAsset.set(s.asset_id, s.next_due_date)
      }
    }

    let breaches = 0
    for (const r of withReturn) {
      const due = dueByAsset.get(r.asset_id)
      if (due && new Date(due) < new Date(r.expected_return_date as string)) breaches++
    }

    if (breaches > 0) {
      items.push({ kind: 'rental_outlives_vgp', count: breaches, detail: null })
    } else {
      checked.push('rental_outlives_vgp')
    }
  }

  // 5. Nobody has signed in recently. Only claimed when the Auth admin API
  //    answered: an unreadable index is not evidence of absence.
  if (input.signInKnown) {
    if (input.daysSinceSignIn === null) {
      items.push({ kind: 'no_recent_signin', count: 0, detail: null })
    } else if (input.daysSinceSignIn > STALE_SIGNIN_DAYS) {
      items.push({
        kind: 'no_recent_signin',
        count: input.daysSinceSignIn,
        detail: null,
      })
    } else {
      checked.push('no_recent_signin')
    }
  }

  const firstError = errors.find((e) => e) ?? null
  return { items, checked, failed: Boolean(firstError), error: firstError }
}

// ---------------------------------------------------------------------------
// Evenements recents
// ---------------------------------------------------------------------------

export type EventKind = 'admin' | 'inspection' | 'rental'

export interface RecentEvent {
  kind: EventKind
  at: string
  /** Already-resolved one-line summary. */
  label: string
  /** Secondary detail: an actor email, an asset name, a result. */
  detail: string | null
}

export interface EventsResult {
  events: RecentEvent[]
  failed: boolean
  error: string | null
}

/**
 * Admin actions, inspections and rentals on one timeline.
 *
 * admin_audit_log alone is near-empty in production (2 rows total, both
 * against loadtest organizations), so a panel reading only that table renders
 * blank for every real customer and says nothing about whether the account is
 * alive. Inspection and rental activity is what actually moves.
 */
export async function fetchRecentEvents(
  supabase: SupabaseClient,
  orgId: string,
  limit = 12
): Promise<EventsResult> {
  const events: RecentEvent[] = []
  const errors: (string | null)[] = []

  const { data: audit, error: auditErr } = await supabase
    .from('admin_audit_log')
    .select('action, created_at, actor_id')
    .eq('target_org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)
  errors.push(auditErr?.message ?? null)

  const auditRows =
    (audit as { action: string; created_at: string; actor_id: string | null }[] | null) ?? []

  const actorIds = [...new Set(auditRows.map((a) => a.actor_id).filter((x): x is string => !!x))]
  const actorEmail = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: actors } = await supabase.from('users').select('id, email').in('id', actorIds)
    for (const a of (actors as { id: string; email: string }[] | null) ?? []) {
      actorEmail.set(a.id, a.email)
    }
  }

  for (const a of auditRows) {
    events.push({
      kind: 'admin',
      at: a.created_at,
      label: a.action,
      detail: a.actor_id ? actorEmail.get(a.actor_id) ?? a.actor_id.slice(0, 8) : null,
    })
  }

  const { data: inspections, error: inspErr } = await supabase
    .from('vgp_inspections')
    .select('created_at, result, inspector_name')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)
  errors.push(inspErr?.message ?? null)

  for (const i of (inspections as { created_at: string; result: string; inspector_name: string | null }[] | null) ?? []) {
    events.push({
      kind: 'inspection',
      at: i.created_at,
      label: i.result,
      detail: i.inspector_name,
    })
  }

  const { data: rentals, error: rentErr } = await supabase
    .from('rentals')
    .select('checkout_date, client_name, status')
    .eq('organization_id', orgId)
    .order('checkout_date', { ascending: false })
    .limit(limit)
  errors.push(rentErr?.message ?? null)

  for (const r of (rentals as { checkout_date: string; client_name: string; status: string }[] | null) ?? []) {
    events.push({
      kind: 'rental',
      at: r.checkout_date,
      label: r.status,
      detail: r.client_name,
    })
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  const firstError = errors.find((e) => e) ?? null
  return {
    events: events.slice(0, limit),
    failed: Boolean(firstError),
    error: firstError,
  }
}
