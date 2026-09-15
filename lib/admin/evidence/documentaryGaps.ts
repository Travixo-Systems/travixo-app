// lib/admin/evidence/documentaryGaps.ts
// D2: inspections with no certificate, and certificates with no resolvable
// inspection reference.
//
// Pure query. Reads only. Nothing here writes.
//
// ---------------------------------------------------------------------------
// WHY A MISSING CERTIFICATE IS NOT A COSMETIC GAP
// ---------------------------------------------------------------------------
//
// The certificate is the DREETS-facing artefact. An inspection without one is
// not a conformant inspection: at a labour inspection the operator can state
// that a machine was verified and cannot show it. app/api/vgp/report/route.ts
// builds the DREETS PDF from these same rows, so a gap here is a gap in the
// document handed to an inspector.
//
// ---------------------------------------------------------------------------
// TWO DIRECTIONS
// ---------------------------------------------------------------------------
//
//   GAP A  inspection with certificate_url NULL or blank
//          The inspection exists; the proof does not.
//
//   GAP B  certificate_url present, but the reference does not resolve:
//          no asset_id, or asset_id pointing at an asset that is not readable
//          (deleted, or belonging to an organization the row does not match).
//          A certificate filed against nothing cannot be produced on demand
//          for a specific machine.
//
// GAP B is deliberately about RESOLVABILITY, not about file existence. Whether
// the UploadThing object behind the URL is still there cannot be established
// from the database, and this detector does not make network calls. A row that
// resolves here can still 404 at the storage layer; that is a separate check
// and is not claimed.
//
// ---------------------------------------------------------------------------
// LEGACY, NOT A LIVE LEAK
// ---------------------------------------------------------------------------
//
// record_inspection() refuses a blank certificate outright
// (`certificate_required`, supabase/schemas/public/functions/record_inspection.sql),
// and the route rejects it before that. Since the 2026-09-03 cutover no
// inspection can be written without one. Every GAP A row therefore predates
// that migration. They stay visible because the compliance hole is still open:
// those inspections are still the record, and still cannot be evidenced.

import type { SupabaseClient } from '@supabase/supabase-js'

export type GapKind = 'missing_certificate' | 'unresolvable_reference'

export interface DocumentaryGapRow {
  kind: GapKind
  organizationId: string
  inspectionId: string
  inspectionDate: string
  inspectionResult: string
  assetId: string | null
  assetName: string | null
  certificateUrl: string | null
  certificateFileName: string | null
  createdAt: string
}

export interface DocumentaryGapResult {
  rows: DocumentaryGapRow[]
  /** Total inspections examined. */
  inspectionsTotal: number
  /** How many carry a certificate, for the aggregate line. */
  withCertificate: number
  failed: boolean
  error: string | null
}

const PAGE = 300

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

function blank(v: string | null | undefined): boolean {
  return v === null || v === undefined || String(v).trim() === ''
}

export async function detectDocumentaryGaps(
  supabase: SupabaseClient
): Promise<DocumentaryGapResult> {
  const empty = (error: string): DocumentaryGapResult => ({
    rows: [],
    inspectionsTotal: 0,
    withCertificate: 0,
    failed: true,
    error,
  })

  const { data, error } = await supabase
    .from('vgp_inspections')
    .select(
      'id, asset_id, organization_id, inspection_date, result, certificate_url, certificate_file_name, created_at'
    )
    .order('inspection_date', { ascending: false })

  if (error) return empty(error.message)

  const inspections = (data ?? []) as {
    id: string
    asset_id: string | null
    organization_id: string
    inspection_date: string
    result: string
    certificate_url: string | null
    certificate_file_name: string | null
    created_at: string
  }[]

  // Resolve asset names for display, and to decide GAP B.
  const assetIds = [...new Set(inspections.map((i) => i.asset_id).filter((x): x is string => !!x))]
  const assets = new Map<string, string>()
  for (const part of chunk(assetIds, PAGE)) {
    const { data: aData, error: aError } = await supabase
      .from('assets')
      .select('id, name')
      .in('id', part)
    if (aError) return empty(aError.message)
    for (const a of (aData ?? []) as { id: string; name: string }[]) {
      assets.set(a.id, a.name)
    }
  }

  const rows: DocumentaryGapRow[] = []
  let withCertificate = 0

  for (const i of inspections) {
    const hasCert = !blank(i.certificate_url)
    if (hasCert) withCertificate++

    const base = {
      organizationId: i.organization_id,
      inspectionId: i.id,
      inspectionDate: i.inspection_date,
      inspectionResult: i.result,
      assetId: i.asset_id,
      assetName: i.asset_id ? assets.get(i.asset_id) ?? null : null,
      certificateUrl: i.certificate_url,
      certificateFileName: i.certificate_file_name,
      createdAt: i.created_at,
    }

    // GAP A: no certificate at all.
    if (!hasCert) {
      rows.push({ ...base, kind: 'missing_certificate' })
      continue
    }

    // GAP B: a certificate that points at nothing resolvable.
    if (!i.asset_id || !assets.has(i.asset_id)) {
      rows.push({ ...base, kind: 'unresolvable_reference' })
    }
  }

  // Failed inspections without proof first: those are the ones an inspector
  // is most likely to ask about.
  const weight = (r: DocumentaryGapRow) =>
    r.kind === 'unresolvable_reference' ? 0 : r.inspectionResult === 'failed' ? 1 : 2

  rows.sort((a, b) => {
    const w = weight(a) - weight(b)
    if (w !== 0) return w
    return b.inspectionDate.localeCompare(a.inspectionDate)
  })

  return {
    rows,
    inspectionsTotal: inspections.length,
    withCertificate,
    failed: false,
    error: null,
  }
}
