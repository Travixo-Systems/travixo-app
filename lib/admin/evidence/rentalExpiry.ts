// lib/admin/evidence/rentalExpiry.ts
// D3: an active rental whose asset falls due for VGP before the customer is
// due to bring it back.
//
// Pure query. Reads only. Nothing here writes.
//
// ---------------------------------------------------------------------------
// WHY THIS IS THE INTERESTING RENTAL QUESTION
// ---------------------------------------------------------------------------
//
// If next_due_date lands before expected_return_date, the machine becomes
// non-conformant while it is standing on a customer's site. Nobody is in a
// position to inspect it: the depot does not have it, and the customer cannot
// perform a VGP. The rental has to be interrupted or the machine runs overdue,
// and the choice between those is better made in advance than on the day.
//
//   BREACH  active rental
//           AND the asset has an active (non-archived) schedule
//           AND schedule.next_due_date < rental.expected_return_date
//
// Measured in whole days between the due date and the expected return: the
// window during which the machine is out, in use, and out of compliance.
//
// ---------------------------------------------------------------------------
// THE SECOND CONDITION, REPORTED ALONGSIDE
// ---------------------------------------------------------------------------
//
// An active rental whose asset has NO schedule at all cannot breach this rule,
// because there is no due date to compare. That is not reassurance. A rented
// machine with no VGP schedule is outside the compliance system entirely: it
// will never appear in an alert, a digest, or the DREETS report. It is reported
// as its own amber condition rather than being silently excluded, because the
// query that only counts breaches would score it as clean.
//
// A rental with no expected_return_date is excluded from BREACH (there is no
// date to compare) and counted separately, for the same reason.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RentalExpiryRow {
  organizationId: string
  rentalId: string
  assetId: string
  assetName: string | null
  clientName: string
  checkoutDate: string
  expectedReturnDate: string
  nextDueDate: string
  /** Whole days the machine is out while overdue. Higher is worse. */
  daysOverdueAtReturn: number
  scheduleId: string
}

export interface UnscheduledRentalRow {
  organizationId: string
  rentalId: string
  assetId: string
  assetName: string | null
  clientName: string
  expectedReturnDate: string | null
}

export interface RentalExpiryResult {
  rows: RentalExpiryRow[]
  /** Active rentals whose asset carries no active VGP schedule. */
  unscheduled: UnscheduledRentalRow[]
  /** Breach count keyed by organization id. */
  perOrg: Record<string, number>
  /** The single worst breach by days, or null when there are none. */
  worst: RentalExpiryRow | null
  activeRentals: number
  /** Active rentals with no expected_return_date, excluded from the rule. */
  withoutReturnDate: number
  failed: boolean
  error: string | null
}

const PAGE = 200

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** Whole days from a to b. Positive when b is later. */
function daysBetween(a: string, b: string): number {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

export async function detectRentalExpiry(
  supabase: SupabaseClient
): Promise<RentalExpiryResult> {
  const empty = (error: string): RentalExpiryResult => ({
    rows: [],
    unscheduled: [],
    perOrg: {},
    worst: null,
    activeRentals: 0,
    withoutReturnDate: 0,
    failed: true,
    error,
  })

  const { data: rentalData, error: rentalError } = await supabase
    .from('rentals')
    .select(
      'id, organization_id, asset_id, client_name, checkout_date, expected_return_date'
    )
    .eq('status', 'active')

  if (rentalError) return empty(rentalError.message)

  const rentals = (rentalData ?? []) as {
    id: string
    organization_id: string
    asset_id: string
    client_name: string
    checkout_date: string
    expected_return_date: string | null
  }[]

  if (rentals.length === 0) {
    return {
      rows: [],
      unscheduled: [],
      perOrg: {},
      worst: null,
      activeRentals: 0,
      withoutReturnDate: 0,
      failed: false,
      error: null,
    }
  }

  const assetIds = [...new Set(rentals.map((r) => r.asset_id))]

  // Earliest active due date per asset: the first deadline is the one that bites.
  const dueByAsset = new Map<string, { nextDue: string; scheduleId: string }>()
  for (const part of chunk(assetIds, PAGE)) {
    const { data, error } = await supabase
      .from('vgp_schedules')
      .select('id, asset_id, next_due_date, archived_at')
      .in('asset_id', part)
    if (error) return empty(error.message)
    for (const s of (data ?? []) as {
      id: string
      asset_id: string | null
      next_due_date: string
      archived_at: string | null
    }[]) {
      if (s.archived_at || !s.asset_id) continue
      const held = dueByAsset.get(s.asset_id)
      if (!held || s.next_due_date < held.nextDue) {
        dueByAsset.set(s.asset_id, { nextDue: s.next_due_date, scheduleId: s.id })
      }
    }
  }

  const assetNames = new Map<string, string>()
  for (const part of chunk(assetIds, PAGE)) {
    const { data, error } = await supabase.from('assets').select('id, name').in('id', part)
    if (error) return empty(error.message)
    for (const a of (data ?? []) as { id: string; name: string }[]) {
      assetNames.set(a.id, a.name)
    }
  }

  const rows: RentalExpiryRow[] = []
  const unscheduled: UnscheduledRentalRow[] = []
  let withoutReturnDate = 0

  for (const r of rentals) {
    const sched = dueByAsset.get(r.asset_id)

    if (!sched) {
      unscheduled.push({
        organizationId: r.organization_id,
        rentalId: r.id,
        assetId: r.asset_id,
        assetName: assetNames.get(r.asset_id) ?? null,
        clientName: r.client_name,
        expectedReturnDate: r.expected_return_date,
      })
      continue
    }

    if (!r.expected_return_date) {
      withoutReturnDate++
      continue
    }

    if (new Date(sched.nextDue) < new Date(r.expected_return_date)) {
      rows.push({
        organizationId: r.organization_id,
        rentalId: r.id,
        assetId: r.asset_id,
        assetName: assetNames.get(r.asset_id) ?? null,
        clientName: r.client_name,
        checkoutDate: r.checkout_date,
        expectedReturnDate: r.expected_return_date,
        nextDueDate: sched.nextDue,
        daysOverdueAtReturn: daysBetween(sched.nextDue, r.expected_return_date),
        scheduleId: sched.scheduleId,
      })
    }
  }

  rows.sort((a, b) => b.daysOverdueAtReturn - a.daysOverdueAtReturn)

  const perOrg: Record<string, number> = {}
  for (const r of rows) perOrg[r.organizationId] = (perOrg[r.organizationId] ?? 0) + 1

  return {
    rows,
    unscheduled,
    perOrg,
    worst: rows[0] ?? null,
    activeRentals: rentals.length,
    withoutReturnDate,
    failed: false,
    error: null,
  }
}
