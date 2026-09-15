// app/(admin)/admin/orgs/[id]/page.tsx
// Platform-admin organisation detail.
//
// Server component. Gated by app/(admin)/admin/layout.tsx, which calls
// requireSuperAdmin() for every /admin route; this page adds no weaker check
// of its own and performs no writes. The write controls it renders are the
// existing AdminOrgActions island, unchanged.
//
// READS GO THROUGH THE COOKIE-BOUND ANON CLIENT
//
// lib/supabase/server.ts, the same client /admin/evidence uses. Not
// service-role. Every cross-tenant read below works only because of the
// super_admin_* SELECT policies added in 4a06175; without them an org-less
// platform admin reads zero rows with no error, which is how this surface
// came to render a confident empty answer over 733 live inspections.
//
// WHAT IS OMITTED, AND WHY IT IS OMITTED RATHER THAN ZEROED
//
// Two of the three header actions the brief asks for have no backing path.
// There is no admin impersonation route anywhere in the codebase, and
// licensed_capacity is written only by Stripe checkout, the Stripe webhook,
// /api/stripe/subscription/capacity and the capacity-drift cron - never by an
// admin path. Rendering "Voir comme l'organisation" and "Modifier la capacite"
// would be two controls that do nothing, so the page states their absence
// instead. Only "Prolonger l'essai" is real, and it is the existing
// extendTrial action.
//
// The Pilot scope panel is omitted per-organization when the org has
// converted to paid: there is no pilot window left to describe.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchSignInIndex } from '@/lib/admin/lastConnected'
import { mostRecentSignIn } from '@/lib/admin/orgHealth'
import { accessLevel, PILOT_MAX_ASSETS } from '@/lib/billing/access-model'
import {
  fetchChain,
  fetchUsage,
  fetchBilling,
  fetchAttention,
  fetchRecentEvents,
} from '@/lib/admin/orgDetail'
import {
  canEndPilot,
  canExtendPilot,
  extendUnavailableReason,
} from '@/lib/admin/orgHealth'
import AdminOrgActions from './AdminOrgActions'
import AdminOrgDetailView, { type PilotScope } from './AdminOrgDetailView'

export const dynamic = 'force-dynamic'

interface OrgDetail {
  id: string
  name: string
  slug: string
  subscription_status: string | null
  is_pilot: boolean
  pilot_start_date: string | null
  pilot_end_date: string | null
  converted_to_paid: boolean
  feature_flags: Record<string, boolean> | null
}

export default async function AdminOrgDetailPage({
  params,
}: {
  // Next 16: params is a Promise.
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select(
      'id, name, slug, subscription_status, is_pilot, pilot_start_date, pilot_end_date, converted_to_paid, feature_flags'
    )
    .eq('id', id)
    .single()

  if (!org) {
    notFound()
  }

  const o = org as OrgDetail

  // --- Headline counts ---------------------------------------------------
  const [assetCount, activeRentalCount, inspectionCount, userCount] =
    await Promise.all([
      supabase
        .from('assets')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', id),
      supabase
        .from('rentals')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', id)
        .eq('status', 'active'),
      supabase
        .from('vgp_inspections')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', id),
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', id),
    ])

  const assets = assetCount.count ?? 0

  // --- Panels, in parallel: they share no state --------------------------
  const [chain, usage, billing, events] = await Promise.all([
    fetchChain(supabase, id),
    fetchUsage(supabase, id),
    fetchBilling(supabase, id),
    fetchRecentEvents(supabase, id),
  ])

  // --- Sign-in recency, for the attention panel --------------------------
  // auth.users.last_sign_in_at is not reachable through PostgREST, so it comes
  // from the Auth admin API. On failure `known` is false and the stale-signin
  // check is skipped rather than asserted: an unreadable index is not evidence
  // that nobody signed in.
  const { data: memberRows } = await supabase
    .from('users')
    .select('id')
    .eq('organization_id', id)

  const memberIds = ((memberRows as { id: string }[] | null) ?? []).map((u) => u.id)
  const signIns = await fetchSignInIndex()
  const lastConnected = mostRecentSignIn(
    memberIds.map((uid) => signIns.byUserId.get(uid) ?? null)
  )

  const attention = await fetchAttention(supabase, id, {
    assetCount: assets,
    licensedCapacity: billing.licensedCapacity,
    daysSinceSignIn: lastConnected.daysAgo,
    signInKnown: signIns.known,
  })

  // --- Pilot scope -------------------------------------------------------
  // Applicable only while there is a pilot window to describe. A converted
  // organization has none, and the panel says so rather than rendering
  // four empty rows.
  const daysRemaining =
    o.pilot_end_date != null
      ? Math.ceil((new Date(o.pilot_end_date).getTime() - Date.now()) / 86400000)
      : null

  const pilot: PilotScope = {
    applicable: o.is_pilot && !o.converted_to_paid,
    isPilot: o.is_pilot,
    startDate: o.pilot_start_date,
    endDate: o.pilot_end_date,
    daysRemaining,
    includedCapacity: PILOT_MAX_ASSETS,
  }

  // --- Access level ------------------------------------------------------
  // licensed_capacity is passed explicitly: accessLevel() treats it as proof
  // of payment, and omitting it computes a paying customer as though they had
  // never subscribed.
  const access = accessLevel({
    is_pilot: o.is_pilot,
    pilot_start_date: o.pilot_start_date,
    pilot_end_date: o.pilot_end_date,
    converted_to_paid: o.converted_to_paid,
    licensed_capacity: billing.licensedCapacity,
  })

  const flags: Record<string, boolean> = o.feature_flags ?? {}

  return (
    <AdminOrgDetailView
      orgName={o.name}
      orgSlug={o.slug}
      accessLevel={access}
      subscriptionStatus={o.subscription_status}
      assetCount={assets}
      activeRentals={activeRentalCount.count ?? 0}
      inspections={inspectionCount.count ?? 0}
      users={userCount.count ?? 0}
      chain={chain}
      usage={usage}
      billing={billing}
      pilot={pilot}
      attention={attention}
      events={events}
      actions={
        <AdminOrgActions
          orgId={o.id}
          orgName={o.name}
          isPilot={o.is_pilot}
          flags={flags}
          canExtend={canExtendPilot(o)}
          extendReason={extendUnavailableReason(o)}
          canEnd={canEndPilot(o)}
          alreadyPaid={o.converted_to_paid}
        />
      }
    />
  )
}
