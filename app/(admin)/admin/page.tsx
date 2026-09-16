// app/(admin)/admin/page.tsx
// Platform-admin overview: the control room.
//
// Server component. Gated by app/(admin)/admin/layout.tsx, which calls
// requireSuperAdmin() for every /admin route; this page adds no weaker check
// of its own and performs no writes.
//
// READS GO THROUGH THE COOKIE-BOUND ANON CLIENT
//
// lib/supabase/server.ts, the same client /admin/evidence and the organisation
// detail page use. Not service-role. Every cross-tenant read works only
// because of the nine super_admin SELECT policies added in 4a06175.
//
// WHAT MOVED, AND WHAT IS GONE
//
// The full organisations table moved to /admin/orgs. It was the first thing on
// this page and it is a reference list, not an operational signal: nineteen
// rows of slugs and tiers do not tell anyone what needs attention today.
//
// "Recent signups" is dropped entirely. Twenty rows of raw user emails is not
// an operational signal, and the same twenty rows are reachable per
// organisation from the detail page.
//
// WHAT IS OMITTED, AND WHY IT IS OMITTED RATHER THAN ZEROED
//
// MRR, ARR and trial-to-paid conversion have no heading, no zero and no dash
// anywhere on this page. Measured live: one organisation carries a
// licensed_capacity, zero subscriptions carry a stripe_subscription_id, and
// the only four billing_events run Feb to May 2026 and end in
// subscription_deleted. Two of the three converted_to_paid organisations were
// set by admin_mark_paid against ZZ-LOADTEST orgs with the UI's own warning
// text pasted in as the reason. A revenue figure over that base would be
// fiction with a currency symbol on it.

import { createClient } from '@/lib/supabase/server'
import { fetchSignInIndex } from '@/lib/admin/lastConnected'
import {
  fetchStrip,
  fetchCatalogue,
  fetchDeliveries,
  fetchWatchlist,
  fetchBillingOverview,
  fetchAdminActions,
} from '@/lib/admin/overview'
import { detectAtomicDisagreement } from '@/lib/admin/evidence/atomicDisagreement'
import { detectDocumentaryGaps } from '@/lib/admin/evidence/documentaryGaps'
import { detectRentalExpiry } from '@/lib/admin/evidence/rentalExpiry'
import AdminOverviewView, { type EvidenceSummary } from './AdminOverviewView'

export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
  const supabase = await createClient()

  // The sign-in index is needed before the watchlist can judge staleness.
  // last_sign_in_at lives in auth.users, which PostgREST does not expose, so
  // it comes from the Auth admin API. On failure `known` is false and the
  // stale-sign-in condition is skipped rather than asserted.
  const signIns = await fetchSignInIndex()

  // Independent reads, so run them together rather than in series.
  const [strip, catalogue, deliveries, billing, actions, d1, d2, d3] =
    await Promise.all([
      fetchStrip(supabase),
      fetchCatalogue(supabase),
      fetchDeliveries(supabase),
      fetchBillingOverview(supabase),
      fetchAdminActions(supabase),
      detectAtomicDisagreement(supabase),
      detectDocumentaryGaps(supabase),
      detectRentalExpiry(supabase),
    ])

  // The watchlist needs the sign-in index and issues per-organisation counts,
  // so it runs after rather than inside the batch above.
  const watch = await fetchWatchlist(supabase, signIns)

  // A detector that could not run is never folded into a zero: the panel
  // renders a failure line instead of a green all-clear.
  const evidence: EvidenceSummary = {
    d1: { rows: d1.rows.length, failed: d1.failed },
    d2: { rows: d2.rows.length, failed: d2.failed },
    d3: { rows: d3.rows.length, failed: d3.failed },
    anyFailed: d1.failed || d2.failed || d3.failed,
    error: d1.error ?? d2.error ?? d3.error,
  }

  return (
    <AdminOverviewView
      strip={strip}
      evidence={evidence}
      catalogue={catalogue}
      deliveries={deliveries}
      watch={watch}
      billing={billing}
      actions={actions}
    />
  )
}
