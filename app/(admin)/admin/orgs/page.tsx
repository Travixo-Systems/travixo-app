// app/(admin)/admin/orgs/page.tsx
// The full organisations table, moved off /admin.
//
// Server component. Gated by app/(admin)/admin/layout.tsx, which calls
// requireSuperAdmin() for every /admin route; this page adds no weaker check
// of its own and performs no writes.
//
// WHY IT MOVED
//
// It was the first thing on the overview. Nineteen rows of slugs, tiers and
// creation dates is a reference list, not an operational signal: it answers
// "what exists" when the overview needs to answer "what needs attention".
// Every column it had is preserved here, plus licensed capacity, plus filters.
//
// Reads go through the cookie-bound ANON client, the same one /admin/evidence
// and the organisation detail page use. Not service-role.

import { createClient } from '@/lib/supabase/server'
import { fetchSignInIndex } from '@/lib/admin/lastConnected'
import { accessLevel } from '@/lib/billing/access-model'
import AdminOrgsListView, { type OrgListRow } from './AdminOrgsListView'

export const dynamic = 'force-dynamic'

const DAY = 86400000

export default async function AdminOrgsListPage() {
  const supabase = await createClient()

  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select(
      'id, name, slug, subscription_tier, subscription_status, is_pilot, pilot_start_date, pilot_end_date, converted_to_paid, created_at'
    )
    .order('created_at', { ascending: false })

  const orgs =
    (orgData as {
      id: string
      name: string
      slug: string
      subscription_tier: string | null
      subscription_status: string | null
      is_pilot: boolean
      pilot_start_date: string | null
      pilot_end_date: string | null
      converted_to_paid: boolean
      created_at: string
    }[] | null) ?? []

  // Per-org user and asset counts. Read once and reduced in JS rather than one
  // count query per organisation per metric: 19 orgs times two metrics is 38
  // round trips, and both tables are small enough to read their id columns.
  const { data: userRows, error: userError } = await supabase
    .from('users')
    .select('id, organization_id')

  const { data: assetRows, error: assetError } = await supabase
    .from('assets')
    .select('id, organization_id')

  const { data: subRows, error: subError } = await supabase
    .from('subscriptions')
    .select('organization_id, licensed_capacity')

  const usersByOrg = new Map<string, number>()
  const userIdsByOrg = new Map<string, string[]>()
  for (const u of (userRows as { id: string; organization_id: string | null }[] | null) ?? []) {
    if (!u.organization_id) continue
    usersByOrg.set(u.organization_id, (usersByOrg.get(u.organization_id) ?? 0) + 1)
    const list = userIdsByOrg.get(u.organization_id)
    if (list) list.push(u.id)
    else userIdsByOrg.set(u.organization_id, [u.id])
  }

  const assetsByOrg = new Map<string, number>()
  for (const a of (assetRows as { id: string; organization_id: string | null }[] | null) ?? []) {
    if (!a.organization_id) continue
    assetsByOrg.set(a.organization_id, (assetsByOrg.get(a.organization_id) ?? 0) + 1)
  }

  const capacityByOrg = new Map<string, number | null>()
  for (const s of (subRows as { organization_id: string; licensed_capacity: number | null }[] | null) ?? []) {
    capacityByOrg.set(s.organization_id, s.licensed_capacity)
  }

  // last_sign_in_at lives in auth.users, which PostgREST does not expose, so it
  // comes from the Auth admin API. On failure `known` is false and every cell
  // renders "unknown" rather than a misleading "never".
  const signIns = await fetchSignInIndex()
  const now = Date.now()

  const rows: OrgListRow[] = orgs.map((o) => {
    const capacity = capacityByOrg.get(o.id) ?? null

    let daysSinceSignIn: number | null = null
    if (signIns.known) {
      for (const uid of userIdsByOrg.get(o.id) ?? []) {
        const iso = signIns.byUserId.get(uid)
        if (!iso) continue
        const d = Math.floor((now - new Date(iso).getTime()) / DAY)
        if (daysSinceSignIn === null || d < daysSinceSignIn) daysSinceSignIn = d
      }
    }

    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      tier: o.subscription_tier,
      status: o.subscription_status,
      isPilot: o.is_pilot,
      access: accessLevel({
        is_pilot: o.is_pilot,
        pilot_start_date: o.pilot_start_date,
        pilot_end_date: o.pilot_end_date,
        converted_to_paid: o.converted_to_paid,
        licensed_capacity: capacity,
      }),
      pilotEndDate: o.pilot_end_date,
      users: usersByOrg.get(o.id) ?? 0,
      assets: assetsByOrg.get(o.id) ?? 0,
      licensedCapacity: capacity,
      createdAt: o.created_at,
      daysSinceSignIn,
    }
  })

  const firstError =
    orgError?.message ?? userError?.message ?? assetError?.message ?? subError?.message ?? null

  return (
    <AdminOrgsListView
      rows={rows}
      signInKnown={signIns.known}
      failed={Boolean(firstError)}
      error={firstError}
    />
  )
}
