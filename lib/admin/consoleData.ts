// lib/admin/consoleData.ts
// Shared cross-tenant reads for the platform-admin console.
//
// WHY THIS EXISTS
//
// Areas 1, 2 and 3 all need the same per-organization aggregates. Three
// separate copies would drift, and the drift would be invisible: each page
// would render a plausible number and they would disagree with each other.
// One module, one definition per metric.
//
// EVERY READ HERE IS RLS-SCOPED
//
// These take the caller's Supabase client, which for an admin page is the
// cookie-bound ANON client from lib/supabase/server.ts. They are NOT
// service-role reads. They work only because of the super_admin_* SELECT
// policies -- the five from the Phase 1 migration plus the nine added in
// 20260915150000_super_admin_read_operational_tables.sql. Without those, every
// count below silently returns zero. See GATES-ADMIN-CONSOLE.md A0.
//
// COUNTING
//
// Counts use `{ count: 'exact', head: true }` rather than fetching rows and
// measuring the array. PostgREST caps a response at 1000 rows by default, so
// counting client-side reports 1000 for a table holding 20697 and looks
// entirely reasonable while being wrong by a factor of twenty.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Milliseconds in a day. */
const DAY = 86400000

/** The comparison window for every delta on the overview. */
export const DELTA_WINDOW_DAYS = 30

export interface PeriodDelta {
  /** Rows created in the last DELTA_WINDOW_DAYS. */
  current: number
  /** Rows created in the DELTA_WINDOW_DAYS before that. */
  prior: number
}

export interface HeadlineCounts {
  organizations: number
  activePilots: number
  paying: number
  assets: number
  rentals: number
  inspections: number
}

export interface HeadlineDeltas {
  organizations: PeriodDelta
  assets: PeriodDelta
  rentals: PeriodDelta
  inspections: PeriodDelta
}

export interface OrgAggregate {
  organizationId: string
  assets: number
  realAssets: number
  demoAssets: number
  rentals: number
  activeRentals: number
  inspections: number
  users: number
  /** subscriptions.licensed_capacity, NULL when there is no subscription. */
  licensedCapacity: number | null
  subscriptionStatus: string | null
}

/** A read that could not run. Callers must not treat `failed` as zero. */
export interface Fallible {
  failed: boolean
  error: string | null
}

// ---------------------------------------------------------------------------
// Counting helpers
// ---------------------------------------------------------------------------

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

/** ISO timestamp N days before now. */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString()
}

/**
 * Rows created in the last window, and in the window before it.
 *
 * Reported as two absolute counts, never as a percentage. Every entity here
 * currently has a prior window of zero, and a percentage over a zero base is
 * either a division by zero or an invented "+100%".
 */
async function periodDelta(
  supabase: SupabaseClient,
  table: string
): Promise<{ delta: PeriodDelta; error: string | null }> {
  const boundary = daysAgoIso(DELTA_WINDOW_DAYS)
  const priorBoundary = daysAgoIso(DELTA_WINDOW_DAYS * 2)

  const current = await countRows(supabase, table, (q) => q.gte('created_at', boundary))
  const prior = await countRows(supabase, table, (q) =>
    q.gte('created_at', priorBoundary).lt('created_at', boundary)
  )

  return {
    delta: { current: current.count, prior: prior.count },
    error: current.error ?? prior.error,
  }
}

// ---------------------------------------------------------------------------
// Headline counts
// ---------------------------------------------------------------------------

export interface HeadlineResult extends Fallible {
  counts: HeadlineCounts
  deltas: HeadlineDeltas
}

/**
 * The six headline counts, with 30-day deltas for the four that have a
 * created_at to measure.
 *
 * "activePilots" is is_pilot AND not yet converted: an org that converted mid
 * pilot is a customer, not a live trial, and counting it as both would double
 * count the only interesting transition on this page.
 *
 * "paying" is converted_to_paid. That flag is set by the Stripe webhook and by
 * admin_mark_paid, and lib/billing/access-model.ts treats it as proof of
 * payment. It is NOT a revenue figure: see GATES-ADMIN-CONSOLE.md for why MRR
 * and ARR are omitted entirely rather than derived from it.
 */
export async function fetchHeadlines(supabase: SupabaseClient): Promise<HeadlineResult> {
  const empty: HeadlineCounts = {
    organizations: 0,
    activePilots: 0,
    paying: 0,
    assets: 0,
    rentals: 0,
    inspections: 0,
  }
  const emptyDelta: PeriodDelta = { current: 0, prior: 0 }

  const [orgs, pilots, paying, assets, rentals, inspections] = await Promise.all([
    countRows(supabase, 'organizations'),
    countRows(supabase, 'organizations', (q) => q.eq('is_pilot', true).eq('converted_to_paid', false)),
    countRows(supabase, 'organizations', (q) => q.eq('converted_to_paid', true)),
    countRows(supabase, 'assets'),
    countRows(supabase, 'rentals'),
    countRows(supabase, 'vgp_inspections'),
  ])

  const firstError =
    orgs.error ?? pilots.error ?? paying.error ?? assets.error ?? rentals.error ?? inspections.error

  if (firstError) {
    return {
      counts: empty,
      deltas: {
        organizations: emptyDelta,
        assets: emptyDelta,
        rentals: emptyDelta,
        inspections: emptyDelta,
      },
      failed: true,
      error: firstError,
    }
  }

  const [dOrgs, dAssets, dRentals, dInspections] = await Promise.all([
    periodDelta(supabase, 'organizations'),
    periodDelta(supabase, 'assets'),
    periodDelta(supabase, 'rentals'),
    periodDelta(supabase, 'vgp_inspections'),
  ])

  const deltaError = dOrgs.error ?? dAssets.error ?? dRentals.error ?? dInspections.error

  return {
    counts: {
      organizations: orgs.count,
      activePilots: pilots.count,
      paying: paying.count,
      assets: assets.count,
      rentals: rentals.count,
      inspections: inspections.count,
    },
    deltas: {
      organizations: dOrgs.delta,
      assets: dAssets.delta,
      rentals: dRentals.delta,
      inspections: dInspections.delta,
    },
    failed: Boolean(deltaError),
    error: deltaError,
  }
}

// ---------------------------------------------------------------------------
// Per-organization aggregates
// ---------------------------------------------------------------------------

export interface OrgAggregateResult extends Fallible {
  byOrg: Map<string, OrgAggregate>
}

/**
 * Per-org counts for every organization at once.
 *
 * Deliberately a handful of full-table reads reduced in JS rather than one
 * count query per org per metric: 19 orgs times five metrics is 95 round trips,
 * and the tables involved are small enough (2732 assets, 146 rentals, 733
 * inspections, 32 users, 19 subscriptions) that reading the id + org columns
 * once is cheaper and atomic across metrics.
 *
 * If assets ever outgrows a single PostgREST page this must move to a grouped
 * RPC. The page cap is the reason `.select('id, organization_id')` is paged
 * explicitly below rather than trusted to return everything.
 */
export async function fetchOrgAggregates(
  supabase: SupabaseClient
): Promise<OrgAggregateResult> {
  const byOrg = new Map<string, OrgAggregate>()

  const blank = (organizationId: string): OrgAggregate => ({
    organizationId,
    assets: 0,
    realAssets: 0,
    demoAssets: 0,
    rentals: 0,
    activeRentals: 0,
    inspections: 0,
    users: 0,
    licensedCapacity: null,
    subscriptionStatus: null,
  })

  const ensure = (organizationId: string): OrgAggregate => {
    let row = byOrg.get(organizationId)
    if (!row) {
      row = blank(organizationId)
      byOrg.set(organizationId, row)
    }
    return row
  }

  // Assets, paged. is_demo_data splits adoption from seeded data.
  const assets = await readAll<{ organization_id: string | null; is_demo_data: boolean | null }>(
    supabase,
    'assets',
    'organization_id, is_demo_data'
  )
  if (assets.error) return { byOrg, failed: true, error: assets.error }
  for (const a of assets.rows) {
    if (!a.organization_id) continue
    const row = ensure(a.organization_id)
    row.assets++
    if (a.is_demo_data) row.demoAssets++
    else row.realAssets++
  }

  const rentals = await readAll<{ organization_id: string | null; status: string | null }>(
    supabase,
    'rentals',
    'organization_id, status'
  )
  if (rentals.error) return { byOrg, failed: true, error: rentals.error }
  for (const r of rentals.rows) {
    if (!r.organization_id) continue
    const row = ensure(r.organization_id)
    row.rentals++
    if (r.status === 'active') row.activeRentals++
  }

  const inspections = await readAll<{ organization_id: string | null }>(
    supabase,
    'vgp_inspections',
    'organization_id'
  )
  if (inspections.error) return { byOrg, failed: true, error: inspections.error }
  for (const i of inspections.rows) {
    if (!i.organization_id) continue
    ensure(i.organization_id).inspections++
  }

  const users = await readAll<{ organization_id: string | null }>(
    supabase,
    'users',
    'organization_id'
  )
  if (users.error) return { byOrg, failed: true, error: users.error }
  for (const u of users.rows) {
    if (!u.organization_id) continue
    ensure(u.organization_id).users++
  }

  // licensed_capacity is the Stripe subscription item quantity and the only
  // input to the published price. NULL means no subscription, never zero.
  const subs = await readAll<{
    organization_id: string
    licensed_capacity: number | null
    status: string | null
  }>(supabase, 'subscriptions', 'organization_id, licensed_capacity, status')
  if (subs.error) return { byOrg, failed: true, error: subs.error }
  for (const s of subs.rows) {
    if (!s.organization_id) continue
    const row = ensure(s.organization_id)
    row.licensedCapacity = s.licensed_capacity
    row.subscriptionStatus = s.status
  }

  return { byOrg, failed: false, error: null }
}

/**
 * Read every row of a table, following PostgREST's page limit.
 *
 * The default cap is 1000. A naive `.select()` on vgp_alerts returns exactly
 * 1000 rows out of 20697 with no error and no indication of truncation, which
 * is indistinguishable from a table that genuinely holds 1000 rows.
 */
export async function readAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  pageSize = 1000
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1)

    if (error) return { rows, error: error.message }

    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return { rows, error: null }
}
