// lib/admin/evidence/atomicDisagreement.ts
// D1: inspection outcome, asset status and schedule state disagreeing on the
// same asset.
//
// Pure query. Reads only. Nothing here writes.
//
// ---------------------------------------------------------------------------
// THE RULE, STATED BEFORE THE ROWS
// ---------------------------------------------------------------------------
//
// An inspection has three consequences, and they must agree:
//
//   1. the inspection row records the outcome
//   2. a FAILED outcome takes the machine out of service (assets.status)
//   3. the schedule advances and records the outcome (vgp_schedules.status)
//
// Disagreement is defined as EITHER of these, on the LATEST inspection for an
// asset (by inspection_date, newest first):
//
//   RULE A  latest result = 'failed'  AND  assets.status <> 'out_of_service'
//           A machine that failed its VGP is bookable. This is the dangerous
//           one: checkout will hand it to a customer while the inspector
//           believes the system took it off the fleet.
//
//   RULE B  latest result = 'failed'  AND  the asset's active schedule status
//           is not 'failed'
//           The inspection says failed; the schedule says otherwise, so the
//           alert and digest paths treat the machine as normally scheduled.
//
// Archived assets and archived schedules are excluded: a retired machine
// disagreeing with anything is not an operational risk.
//
// ---------------------------------------------------------------------------
// A RULE DELIBERATELY NOT USED
// ---------------------------------------------------------------------------
//
// "vgp_schedules.last_inspection_date differs from the latest inspection_date"
// looks like the obvious third rule and matches 549 rows on live data. It is
// excluded on purpose. Those dates were rewritten in bulk by
// 20260915120000_reseed_vgp_due_dates.sql, which reseeded due dates across four
// test organizations. Reporting them would surface a deliberate data migration
// as a safety defect, and 549 false rows would bury the 13 real ones.
//
// ---------------------------------------------------------------------------
// WHAT THIS DOES AND DOES NOT SAY ABOUT THE WRITE PATH
// ---------------------------------------------------------------------------
//
// These rows are LEGACY. The three writes used to be three sequential
// statements where the last two logged their errors and continued, so the
// inspection could land while the status change did not. Since
// 20260903100000_record_inspection_rpc.sql the route calls record_inspection(),
// which does all three in one transaction (app/api/vgp/inspections/route.ts:249).
// Every inspection row in production predates that cutover, so this detector
// reports damage already done, not a leak still running.
//
// It stays because the rows are still wrong today: a machine that failed its
// VGP in 2025 and still reads 'available' is bookable this afternoon.

import type { SupabaseClient } from '@supabase/supabase-js'

export type DisagreementRule = 'failed_asset_in_service' | 'failed_schedule_not_failed'

export interface DisagreementRow {
  rule: DisagreementRule
  organizationId: string
  assetId: string
  assetName: string
  assetStatus: string
  inspectionId: string
  inspectionDate: string
  inspectionResult: string
  scheduleId: string | null
  scheduleStatus: string | null
  inspectionCreatedAt: string
}

export interface DisagreementResult {
  rows: DisagreementRow[]
  /** Assets carrying at least one inspection, the population this ran over. */
  assetsInspected: number
  /** True when the query could not run; callers must not read `rows` as zero. */
  failed: boolean
  error: string | null
}

const PAGE = 300

/** Chunk an array, because .in() has a practical URL length limit. */
function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

export async function detectAtomicDisagreement(
  supabase: SupabaseClient
): Promise<DisagreementResult> {
  const empty = (error: string): DisagreementResult => ({
    rows: [],
    assetsInspected: 0,
    failed: true,
    error,
  })

  // Every inspection, newest first, so the first one seen per asset is latest.
  const { data: insData, error: insError } = await supabase
    .from('vgp_inspections')
    .select('id, asset_id, organization_id, inspection_date, result, created_at')
    .order('inspection_date', { ascending: false })

  if (insError) return empty(insError.message)

  const latest = new Map<
    string,
    {
      id: string
      asset_id: string
      organization_id: string
      inspection_date: string
      result: string
      created_at: string
    }
  >()
  for (const r of (insData ?? []) as {
    id: string
    asset_id: string | null
    organization_id: string
    inspection_date: string
    result: string
    created_at: string
  }[]) {
    if (!r.asset_id) continue
    if (!latest.has(r.asset_id)) {
      latest.set(r.asset_id, { ...r, asset_id: r.asset_id })
    }
  }

  const assetIds = [...latest.keys()]
  if (assetIds.length === 0) {
    return { rows: [], assetsInspected: 0, failed: false, error: null }
  }

  // Assets, excluding archived: a retired machine cannot be booked out.
  const assets = new Map<string, { id: string; name: string; status: string }>()
  for (const part of chunk(assetIds, PAGE)) {
    const { data, error } = await supabase
      .from('assets')
      .select('id, name, status, archived_at')
      .in('id', part)
    if (error) return empty(error.message)
    for (const a of (data ?? []) as {
      id: string
      name: string
      status: string | null
      archived_at: string | null
    }[]) {
      if (a.archived_at) continue
      assets.set(a.id, { id: a.id, name: a.name, status: a.status ?? 'unknown' })
    }
  }

  // Active schedules only, keyed by asset.
  const schedules = new Map<string, { id: string; status: string | null }>()
  for (const part of chunk(assetIds, PAGE)) {
    const { data, error } = await supabase
      .from('vgp_schedules')
      .select('id, asset_id, status, archived_at')
      .in('asset_id', part)
    if (error) return empty(error.message)
    for (const s of (data ?? []) as {
      id: string
      asset_id: string | null
      status: string | null
      archived_at: string | null
    }[]) {
      if (s.archived_at || !s.asset_id) continue
      if (!schedules.has(s.asset_id)) schedules.set(s.asset_id, { id: s.id, status: s.status })
    }
  }

  const rows: DisagreementRow[] = []

  for (const assetId of assetIds) {
    const ins = latest.get(assetId)!
    const asset = assets.get(assetId)
    if (!asset) continue // archived or unreadable

    const sched = schedules.get(assetId) ?? null

    const base = {
      organizationId: ins.organization_id,
      assetId,
      assetName: asset.name,
      assetStatus: asset.status,
      inspectionId: ins.id,
      inspectionDate: ins.inspection_date,
      inspectionResult: ins.result,
      inspectionCreatedAt: ins.created_at,
      scheduleId: sched?.id ?? null,
      scheduleStatus: sched?.status ?? null,
    }

    // RULE A: failed, yet still in service.
    if (ins.result === 'failed' && asset.status !== 'out_of_service') {
      rows.push({ ...base, rule: 'failed_asset_in_service' })
    }

    // RULE B: failed, yet the schedule does not say so.
    if (ins.result === 'failed' && sched && sched.status !== 'failed') {
      rows.push({ ...base, rule: 'failed_schedule_not_failed' })
    }
  }

  // Worst first: an in-service failed machine outranks a stale schedule flag.
  rows.sort((a, b) => {
    if (a.rule !== b.rule) return a.rule === 'failed_asset_in_service' ? -1 : 1
    return b.inspectionDate.localeCompare(a.inspectionDate)
  })

  return { rows, assetsInspected: assetIds.length, failed: false, error: null }
}
