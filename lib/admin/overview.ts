// lib/admin/overview.ts
// Live reads behind /admin, the platform control room.
//
// EVERY READ IS RLS-SCOPED
//
// These take the caller's Supabase client, which on an admin page is the
// cookie-bound ANON client from lib/supabase/server.ts. Not service-role. They
// return rows only because of the nine super_admin SELECT policies added in
// 4a06175; without them an org-less platform admin reads zero rows with no
// error, which is how this surface once rendered a confident empty answer over
// 733 live inspections.
//
// COUNTING
//
// Counts use { count: 'exact', head: true }. PostgREST caps a response at 1000
// rows, so counting a returned array reports 1000 for a table holding 20705
// and looks entirely reasonable while being wrong by a factor of twenty.
//
// FAILURE IS NOT ZERO
//
// Every result carries `failed`. A panel renders a failure state rather than a
// zero when its read could not run: "nothing here" and "I could not look" are
// different facts and only one of them is reassuring.

import type { SupabaseClient } from '@supabase/supabase-js'
import { accessLevel } from '@/lib/billing/access-model'

const DAY = 86400000

/** Comparison window for every delta on this page. */
export const DELTA_WINDOW_DAYS = 30

/** A pilot inside this many days of its end date is worth a call. */
export const PILOT_ENDING_DAYS = 14

/** No sign-in for this long puts an organization on the watchlist. */
export const STALE_SIGNIN_DAYS = 30

/** An evidence leg below this share is a watchlist condition. */
export const EVIDENCE_FLOOR_PCT = 50

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
// Top strip
// ---------------------------------------------------------------------------

export interface StatCount {
  key: string
  value: number
  /** Rows created in the last window. Null when the entity has no usable date. */
  current: number | null
  /** Rows created in the window before it. Null likewise. */
  prior: number | null
}

export interface StripResult {
  stats: StatCount[]
  failed: boolean
  error: string | null
}

/**
 * The six headline counts, each with an absolute 30-day delta.
 *
 * "essais actifs" is is_pilot AND not converted: an organization that
 * converted mid-pilot is a customer, not a live trial, and counting it as both
 * would double count the only transition this page exists to watch.
 *
 * "clients payants" is converted_to_paid. That flag is set by the Stripe
 * webhook and by admin_mark_paid, and access-model.ts treats it as proof of
 * payment. It is NOT a revenue figure, which is why no revenue panel exists.
 */
export async function fetchStrip(supabase: SupabaseClient): Promise<StripResult> {
  const boundary = daysAgoIso(DELTA_WINDOW_DAYS)
  const priorBoundary = daysAgoIso(DELTA_WINDOW_DAYS * 2)
  const errors: (string | null)[] = []

  const withDelta = async (
    key: string,
    table: string,
    base: (q: any) => any = (q) => q
  ): Promise<StatCount> => {
    const total = await countRows(supabase, table, base)
    const current = await countRows(supabase, table, (q) =>
      base(q).gte('created_at', boundary)
    )
    const prior = await countRows(supabase, table, (q) =>
      base(q).gte('created_at', priorBoundary).lt('created_at', boundary)
    )
    errors.push(total.error, current.error, prior.error)
    return { key, value: total.count, current: current.count, prior: prior.count }
  }

  const organizations = await withDelta('organizations', 'organizations')
  const pilots = await withDelta('activePilots', 'organizations', (q) =>
    q.eq('is_pilot', true).eq('converted_to_paid', false)
  )
  const paying = await withDelta('paying', 'organizations', (q) =>
    q.eq('converted_to_paid', true)
  )
  const assets = await withDelta('assets', 'assets')
  const rentals = await withDelta('activeRentals', 'rentals', (q) =>
    q.eq('status', 'active')
  )
  const inspections = await withDelta('inspections', 'vgp_inspections')

  const firstError = errors.find((e) => e) ?? null
  return {
    stats: [organizations, pilots, paying, assets, rentals, inspections],
    failed: Boolean(firstError),
    error: firstError,
  }
}

// ---------------------------------------------------------------------------
// Panel 2: regulatory catalogue
// ---------------------------------------------------------------------------

export interface CatalogueResult {
  total: number
  /** Profiles carrying a regulatory_reference (the arrete article). */
  sourced: number
  /** classification_status = 'manual_only': no automatic interval. */
  manual: number
  /** classification_status = 'requires_confirmation'. */
  toConfirm: number
  failed: boolean
  error: string | null
}

export async function fetchCatalogue(
  supabase: SupabaseClient
): Promise<CatalogueResult> {
  const { data, error } = await supabase
    .from('vgp_regulatory_profiles')
    .select('classification_status, regulatory_reference')

  if (error) {
    return {
      total: 0,
      sourced: 0,
      manual: 0,
      toConfirm: 0,
      failed: true,
      error: error.message,
    }
  }

  const rows =
    (data as { classification_status: string; regulatory_reference: string | null }[] | null) ??
    []

  return {
    total: rows.length,
    sourced: rows.filter((r) => (r.regulatory_reference ?? '').trim() !== '').length,
    manual: rows.filter((r) => r.classification_status === 'manual_only').length,
    toConfirm: rows.filter((r) => r.classification_status === 'requires_confirmation')
      .length,
    failed: false,
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Panel 3: deliveries
// ---------------------------------------------------------------------------

export interface DigestDelivery {
  sentAt: string
  recipient: string
  itemCount: number
  period: string
  providerMessageId: string | null
}

export interface DeliveriesResult {
  alertsSentToday: number
  alertsSentTotal: number
  /** sent = false. The queue behind the cron. */
  alertsQueued: number
  lastDigests: DigestDelivery[]
  digestTotal: number
  failed: boolean
  error: string | null
}

/**
 * Alert and digest delivery.
 *
 * NO FAILURE COLUMN EXISTS. vgp_alerts records `sent` and `sent_at`; there is
 * no error, attempt or bounce column anywhere in the schema, and
 * vgp_digest_deliveries holds one row per delivery Resend ACKNOWLEDGED, so a
 * failed send leaves no row at all. "Failures" is therefore reported as the
 * queued count -- alerts that have not gone out -- and the page says that is
 * what it is rather than implying a delivery-failure feed exists.
 */
export async function fetchDeliveries(
  supabase: SupabaseClient
): Promise<DeliveriesResult> {
  const today = new Date().toISOString().slice(0, 10)

  const sentToday = await countRows(supabase, 'vgp_alerts', (q) =>
    q.gte('sent_at', `${today}T00:00:00Z`)
  )
  const sentTotal = await countRows(supabase, 'vgp_alerts', (q) => q.eq('sent', true))
  const queued = await countRows(supabase, 'vgp_alerts', (q) => q.eq('sent', false))

  const { data, error } = await supabase
    .from('vgp_digest_deliveries')
    .select('sent_at, recipient_email, item_count, period, provider_message_id')
    .order('sent_at', { ascending: false })
    .limit(3)

  const totalDigests = await countRows(supabase, 'vgp_digest_deliveries')

  const rows =
    (data as {
      sent_at: string
      recipient_email: string
      item_count: number
      period: string
      provider_message_id: string | null
    }[] | null) ?? []

  const firstError =
    sentToday.error ?? sentTotal.error ?? queued.error ?? error?.message ?? totalDigests.error ?? null

  return {
    alertsSentToday: sentToday.count,
    alertsSentTotal: sentTotal.count,
    alertsQueued: queued.count,
    lastDigests: rows.map((r) => ({
      sentAt: r.sent_at,
      recipient: r.recipient_email,
      itemCount: r.item_count,
      period: r.period,
      providerMessageId: r.provider_message_id,
    })),
    digestTotal: totalDigests.count,
    failed: Boolean(firstError),
    error: firstError,
  }
}

// ---------------------------------------------------------------------------
// Panel 4: organizations to watch
// ---------------------------------------------------------------------------

export type WatchCondition =
  | 'over_capacity'
  | 'pilot_ending'
  | 'no_recent_signin'
  | 'evidence_below_floor'
  | 'locked_with_assets'

export interface WatchRow {
  organizationId: string
  name: string
  access: 'full' | 'read_only' | 'locked'
  subscriptionStatus: string | null
  assets: number
  licensedCapacity: number | null
  /** Inspections with a certificate, as a percentage. Null with no inspections. */
  evidencePct: number | null
  /** Every condition this organization met, worst first. */
  conditions: WatchCondition[]
  /** Days until the pilot ends; negative once past. Null when not a pilot. */
  pilotDaysRemaining: number | null
  /** Days since the most recent sign-in. Null when never or unknown. */
  daysSinceSignIn: number | null
}

export interface WatchResult {
  rows: WatchRow[]
  /** Organizations examined, so a clean panel can say what it checked. */
  examined: number
  failed: boolean
  error: string | null
}

/** Worst first. The order here is the order the panel ranks by. */
const CONDITION_SEVERITY: WatchCondition[] = [
  'over_capacity',
  'pilot_ending',
  'locked_with_assets',
  'no_recent_signin',
  'evidence_below_floor',
]

function severityOf(conditions: WatchCondition[]): number {
  let best = CONDITION_SEVERITY.length
  for (const c of conditions) {
    const i = CONDITION_SEVERITY.indexOf(c)
    if (i !== -1 && i < best) best = i
  }
  return best
}

/**
 * Organizations meeting at least one condition. Never the full list.
 *
 * The full list lives at /admin/orgs. This panel exists to answer "who needs
 * attention today", and a table of all 19 organizations answers that by making
 * the reader do the filtering.
 *
 * `signIns` is passed in rather than read here: last_sign_in_at lives in
 * auth.users, which PostgREST does not expose, so it comes from the Auth admin
 * API via lib/admin/lastConnected.ts. When that index could not be read, the
 * stale-sign-in condition is SKIPPED rather than asserted -- an unreadable
 * index is not evidence that nobody signed in.
 */
export async function fetchWatchlist(
  supabase: SupabaseClient,
  signIns: { known: boolean; byUserId: Map<string, string | null> }
): Promise<WatchResult> {
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select(
      'id, name, is_pilot, converted_to_paid, pilot_start_date, pilot_end_date, subscription_status'
    )

  if (orgError) {
    return { rows: [], examined: 0, failed: true, error: orgError.message }
  }

  const orgs =
    (orgData as {
      id: string
      name: string
      is_pilot: boolean
      converted_to_paid: boolean
      pilot_start_date: string | null
      pilot_end_date: string | null
      subscription_status: string | null
    }[] | null) ?? []

  const { data: subData, error: subError } = await supabase
    .from('subscriptions')
    .select('organization_id, licensed_capacity')

  if (subError) {
    return { rows: [], examined: orgs.length, failed: true, error: subError.message }
  }

  const capacityBy = new Map<string, number | null>()
  for (const s of (subData as { organization_id: string; licensed_capacity: number | null }[] | null) ?? []) {
    capacityBy.set(s.organization_id, s.licensed_capacity)
  }

  // Most recent sign-in per organization, from the passed-in auth index.
  const { data: userData } = await supabase
    .from('users')
    .select('id, organization_id')

  const recentByOrg = new Map<string, number>()
  if (signIns.known) {
    const now = Date.now()
    for (const u of (userData as { id: string; organization_id: string | null }[] | null) ?? []) {
      if (!u.organization_id) continue
      const iso = signIns.byUserId.get(u.id)
      if (!iso) continue
      const days = Math.floor((now - new Date(iso).getTime()) / DAY)
      const held = recentByOrg.get(u.organization_id)
      if (held === undefined || days < held) recentByOrg.set(u.organization_id, days)
    }
  }

  const rows: WatchRow[] = []
  const errors: (string | null)[] = []
  const now = Date.now()

  for (const o of orgs) {
    const capacity = capacityBy.get(o.id) ?? null

    const assets = await countRows(supabase, 'assets', (q) =>
      q.eq('organization_id', o.id)
    )
    const inspections = await countRows(supabase, 'vgp_inspections', (q) =>
      q.eq('organization_id', o.id)
    )
    const certified = await countRows(supabase, 'vgp_inspections', (q) =>
      q.eq('organization_id', o.id).not('certificate_url', 'is', null)
    )
    errors.push(assets.error, inspections.error, certified.error)

    const evidencePct =
      inspections.count > 0
        ? Math.round((certified.count / inspections.count) * 100)
        : null

    const pilotDaysRemaining = o.pilot_end_date
      ? Math.ceil((new Date(o.pilot_end_date).getTime() - now) / DAY)
      : null

    const access = accessLevel({
      is_pilot: o.is_pilot,
      pilot_start_date: o.pilot_start_date,
      pilot_end_date: o.pilot_end_date,
      converted_to_paid: o.converted_to_paid,
      licensed_capacity: capacity,
    })

    const daysSinceSignIn = recentByOrg.get(o.id) ?? null

    const conditions: WatchCondition[] = []

    if (capacity != null && assets.count > capacity) {
      conditions.push('over_capacity')
    }
    if (
      o.is_pilot &&
      !o.converted_to_paid &&
      pilotDaysRemaining !== null &&
      pilotDaysRemaining >= 0 &&
      pilotDaysRemaining <= PILOT_ENDING_DAYS
    ) {
      conditions.push('pilot_ending')
    }
    // Locked AND still holding assets: the fleet is stranded behind a wall.
    // A locked organization with no assets is simply dormant.
    if (access === 'locked' && assets.count > 0) {
      conditions.push('locked_with_assets')
    }
    // Only claimed when the auth index answered.
    if (signIns.known && daysSinceSignIn !== null && daysSinceSignIn > STALE_SIGNIN_DAYS) {
      conditions.push('no_recent_signin')
    }
    if (evidencePct !== null && evidencePct < EVIDENCE_FLOOR_PCT) {
      conditions.push('evidence_below_floor')
    }

    if (conditions.length === 0) continue

    conditions.sort((a, b) => CONDITION_SEVERITY.indexOf(a) - CONDITION_SEVERITY.indexOf(b))

    rows.push({
      organizationId: o.id,
      name: o.name,
      access,
      subscriptionStatus: o.subscription_status,
      assets: assets.count,
      licensedCapacity: capacity,
      evidencePct,
      conditions,
      pilotDaysRemaining,
      daysSinceSignIn,
    })
  }

  rows.sort((a, b) => {
    const s = severityOf(a.conditions) - severityOf(b.conditions)
    if (s !== 0) return s
    return b.conditions.length - a.conditions.length
  })

  const firstError = errors.find((e) => e) ?? null
  return {
    rows,
    examined: orgs.length,
    failed: Boolean(firstError),
    error: firstError,
  }
}

// ---------------------------------------------------------------------------
// Panel 5: billing
// ---------------------------------------------------------------------------

export interface BillingRow {
  organizationId: string
  name: string
  licensedCapacity: number
  billingCycle: string | null
  status: string | null
  stripeSubscriptionId: string | null
}

export interface BillingOverviewResult {
  rows: BillingRow[]
  /** Subscription rows in total, licensed or not. */
  subscriptionsTotal: number
  /** How many carry a stripe_subscription_id. */
  stripeLinked: number
  failed: boolean
  error: string | null
}

/**
 * Organizations carrying a licensed capacity.
 *
 * NO REVENUE FIGURE IS DERIVED HERE, DELIBERATELY. MRR, ARR and
 * trial-to-paid conversion are omitted from this surface entirely rather than
 * rendered as zero. Measured live: one organization carries a
 * licensed_capacity, zero rows carry a stripe_subscription_id, and the only
 * four billing_events run Feb to May 2026 and end in subscription_deleted. Of
 * three converted_to_paid organizations, two were set by admin_mark_paid
 * against ZZ-LOADTEST orgs with the UI's own warning text pasted in as the
 * reason. A rate or a total over that base would be fiction with a currency
 * symbol on it.
 *
 * The price shown per row is computed from lib/billing/capacity-price.ts, the
 * single source of the published grid. It is what the grid SAYS this capacity
 * costs, not what anyone has been invoiced -- nothing here has a Stripe
 * subscription behind it.
 */
export async function fetchBillingOverview(
  supabase: SupabaseClient
): Promise<BillingOverviewResult> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('organization_id, licensed_capacity, billing_cycle, status, stripe_subscription_id')

  if (error) {
    return {
      rows: [],
      subscriptionsTotal: 0,
      stripeLinked: 0,
      failed: true,
      error: error.message,
    }
  }

  const subs =
    (data as {
      organization_id: string
      licensed_capacity: number | null
      billing_cycle: string | null
      status: string | null
      stripe_subscription_id: string | null
    }[] | null) ?? []

  const licensed = subs.filter((s) => s.licensed_capacity != null)

  const nameById = new Map<string, string>()
  if (licensed.length > 0) {
    for (const part of chunk(licensed.map((s) => s.organization_id), CHUNK)) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', part)
      for (const o of (orgs as { id: string; name: string }[] | null) ?? []) {
        nameById.set(o.id, o.name)
      }
    }
  }

  return {
    rows: licensed.map((s) => ({
      organizationId: s.organization_id,
      name: nameById.get(s.organization_id) ?? s.organization_id.slice(0, 8),
      licensedCapacity: s.licensed_capacity as number,
      billingCycle: s.billing_cycle,
      status: s.status,
      stripeSubscriptionId: s.stripe_subscription_id,
    })),
    subscriptionsTotal: subs.length,
    stripeLinked: subs.filter((s) => s.stripe_subscription_id).length,
    failed: false,
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Panel 6: recent admin actions
// ---------------------------------------------------------------------------

export interface AdminActionRow {
  id: string
  action: string
  createdAt: string
  actorEmail: string | null
  targetOrgId: string | null
  targetOrgName: string | null
  /** Compact before -> after summary, resolved per action type. */
  summary: string
}

export interface AdminActionsResult {
  rows: AdminActionRow[]
  failed: boolean
  error: string | null
}

function formatDay(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : '-'
}

/**
 * Compact "before -> after" per audited action.
 *
 * admin_mark_paid HAS A BRANCH HERE. It did not before: the previous
 * implementation covered extend_trial, set_feature_flag and end_pilot and fell
 * through to '-' for everything else. Both audit rows that exist in production
 * are admin_mark_paid, so the Change column rendered '-' for 2 of 2 rows --
 * the one action that has ever run was the one the summary could not describe.
 */
export function summarizeAudit(row: {
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}): string {
  const before = (row.before ?? {}) as Record<string, any>
  const after = (row.after ?? {}) as Record<string, any>

  if (row.action === 'extend_trial') {
    const branch = after.branch ?? 'trial'
    const field = branch === 'pilot' ? 'pilot_end_date' : 'trial_ends_at'
    return `${branch} ${formatDay(before[field])} -> ${formatDay(after[field])} (+${after.days ?? '?'}d)`
  }

  if (row.action === 'set_feature_flag') {
    return `${after.flag ?? '?'} -> ${after.enabled ? 'enabled' : 'disabled'}`
  }

  if (row.action === 'end_pilot') {
    return `ended (${after.mode ?? '?'}) ${formatDay(before.pilot_end_date)} -> ${formatDay(after.pilot_end_date)}`
  }

  if (row.action === 'admin_mark_paid') {
    // The plan and the tier transition are the substance; `source` is what
    // keeps a manual grant distinguishable from a Stripe conversion forever
    // after, so it is shown rather than assumed.
    const plan = after.plan ?? '?'
    const tier = `${before.subscription_tier ?? '?'} -> ${after.subscription_tier ?? '?'}`
    const source = after.source ?? 'unknown'
    return `${plan} (${tier}), source ${source}`
  }

  return '-'
}

export async function fetchAdminActions(
  supabase: SupabaseClient,
  limit = 8
): Promise<AdminActionsResult> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('id, action, created_at, actor_id, target_org_id, before, after')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return { rows: [], failed: true, error: error.message }
  }

  const audit =
    (data as {
      id: string
      action: string
      created_at: string
      actor_id: string | null
      target_org_id: string | null
      before: Record<string, unknown> | null
      after: Record<string, unknown> | null
    }[] | null) ?? []

  const actorIds = [...new Set(audit.map((a) => a.actor_id).filter((x): x is string => !!x))]
  const actorEmail = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: actors } = await supabase.from('users').select('id, email').in('id', actorIds)
    for (const a of (actors as { id: string; email: string }[] | null) ?? []) {
      actorEmail.set(a.id, a.email)
    }
  }

  const orgIds = [...new Set(audit.map((a) => a.target_org_id).filter((x): x is string => !!x))]
  const orgName = new Map<string, string>()
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase.from('organizations').select('id, name').in('id', orgIds)
    for (const o of (orgs as { id: string; name: string }[] | null) ?? []) {
      orgName.set(o.id, o.name)
    }
  }

  return {
    rows: audit.map((a) => ({
      id: a.id,
      action: a.action,
      createdAt: a.created_at,
      actorEmail: a.actor_id ? actorEmail.get(a.actor_id) ?? null : null,
      targetOrgId: a.target_org_id,
      targetOrgName: a.target_org_id ? orgName.get(a.target_org_id) ?? null : null,
      summary: summarizeAudit(a),
    })),
    failed: false,
    error: null,
  }
}
