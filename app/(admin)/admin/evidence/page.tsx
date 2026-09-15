// app/(admin)/admin/evidence/page.tsx
// Platform-admin evidence: three detectors over live data.
//
// Read-only. Server component. Gated by app/(admin)/admin/layout.tsx, which
// calls requireSuperAdmin() for every /admin route. This page adds no weaker
// check of its own and performs no writes.
//
// The detectors are pure queries in lib/admin/evidence/. They run here, on the
// server, and hand plain rows to a client island that renders them through
// lib/i18n.ts. That split exists because useLanguage() is a client hook and
// these pages are force-dynamic server components.
//
// EXCEPTION-FIRST
//
// Offending rows sit above aggregates, and a detector matching nothing renders
// a green line rather than disappearing. A section that hides itself when clean
// is indistinguishable from a section that broke, and the second is the one
// that quietly stops protecting anything. For the same reason a detector that
// could not run renders as a failure, never as zero.

import { createClient } from '@/lib/supabase/server'
import { detectAtomicDisagreement } from '@/lib/admin/evidence/atomicDisagreement'
import { detectDocumentaryGaps } from '@/lib/admin/evidence/documentaryGaps'
import { detectRentalExpiry } from '@/lib/admin/evidence/rentalExpiry'
import AdminEvidenceView from './AdminEvidenceView'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Evidence',
}

export default async function AdminEvidencePage() {
  const supabase = await createClient()

  // Independent detectors, so run them together rather than in series.
  const [d1, d2, d3] = await Promise.all([
    detectAtomicDisagreement(supabase),
    detectDocumentaryGaps(supabase),
    detectRentalExpiry(supabase),
  ])

  // Resolve organization names once for every id the three detectors surfaced.
  const orgIds = new Set<string>()
  for (const r of d1.rows) orgIds.add(r.organizationId)
  for (const r of d2.rows) orgIds.add(r.organizationId)
  for (const r of d3.rows) orgIds.add(r.organizationId)
  for (const r of d3.unscheduled) orgIds.add(r.organizationId)
  for (const id of Object.keys(d3.perOrg)) orgIds.add(id)

  const orgNames: Record<string, string> = {}
  if (orgIds.size > 0) {
    const { data } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', [...orgIds])
    for (const o of (data as { id: string; name: string }[] | null) ?? []) {
      orgNames[o.id] = o.name
    }
  }

  return <AdminEvidenceView d1={d1} d2={d2} d3={d3} orgNames={orgNames} />
}
