// app/(admin)/admin/page.tsx
// Platform-admin home: cross-tenant organizations table + recent signups.
// Read-only. Server component. Gated by app/(admin)/admin/layout.tsx.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Test-user heuristic.
//
// NOT AUTHORITATIVE. There is NO database column marking test accounts.
// These patterns are matched against the user email purely to surface a
// visual "TEST?" hint in the admin UI. Do not use this for billing, access
// control, or any decision that matters. A real customer could match one of
// these patterns; a test account could match none.
// ---------------------------------------------------------------------------
const TEST_PATTERNS: string[] = [
  '+test', // plus-addressed test inboxes, e.g. someone+test@gmail.com
  'example.com', // RFC 2606 reserved example domain
  '@travixosystems.com', // TraviXO's own domain (internal/staff accounts)
  'travixo', // any TraviXO-owned address (e.g. travixosystems@gmail.com)
]

function looksLikeTestUser(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.toLowerCase()
  return TEST_PATTERNS.some((p) => e.includes(p))
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  // Stable, locale-independent rendering (YYYY-MM-DD) so the table reads
  // the same regardless of where the admin is.
  return value.slice(0, 10)
}

interface OrgRow {
  id: string
  name: string
  slug: string
  subscription_tier: string | null
  subscription_status: string | null
  is_pilot: boolean
  trial_ends_at: string | null
  pilot_end_date: string | null
  created_at: string
}

interface SignupRow {
  id: string
  email: string
  full_name: string | null
  role: string
  organization_id: string | null
  created_at: string
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  // --- Organizations (newest first) -------------------------------------
  // super_admin_all_access on organizations grants full cross-tenant read.
  const { data: orgsData } = await supabase
    .from('organizations')
    .select(
      'id, name, slug, subscription_tier, subscription_status, is_pilot, trial_ends_at, pilot_end_date, created_at'
    )
    .order('created_at', { ascending: false })

  const orgs: OrgRow[] = (orgsData as OrgRow[] | null) ?? []

  // --- Per-org user counts ---------------------------------------------
  // super_admin_read_all_users (this migration) grants full cross-tenant
  // read of users, so these counts span every tenant.
  const { data: allUsers } = await supabase
    .from('users')
    .select('id, organization_id')

  const userCountByOrg = new Map<string, number>()
  for (const u of (allUsers as { id: string; organization_id: string | null }[] | null) ?? []) {
    if (!u.organization_id) continue
    userCountByOrg.set(u.organization_id, (userCountByOrg.get(u.organization_id) ?? 0) + 1)
  }

  // --- Per-org asset counts --------------------------------------------
  // Cross-tenant read is granted by super_admin_read_all_assets (added in
  // the Phase 1 migration), which routes through is_super_admin(). So these
  // counts span every tenant for a platform admin.
  const { data: allAssets } = await supabase
    .from('assets')
    .select('id, organization_id')

  const assetCountByOrg = new Map<string, number>()
  for (const a of (allAssets as { id: string; organization_id: string }[] | null) ?? []) {
    if (!a.organization_id) continue
    assetCountByOrg.set(a.organization_id, (assetCountByOrg.get(a.organization_id) ?? 0) + 1)
  }

  // --- Recent signups (last 20 users across all orgs) -------------------
  const { data: signupsData } = await supabase
    .from('users')
    .select('id, email, full_name, role, organization_id, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  const signups: SignupRow[] = (signupsData as SignupRow[] | null) ?? []

  const orgNameById = new Map<string, string>()
  for (const o of orgs) orgNameById.set(o.id, o.name)

  return (
    <div className="space-y-10">
      {/* ============================ Organizations ====================== */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Organizations</h1>
          <span className="text-sm text-gray-500">{orgs.length} total</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Pilot</th>
                <th className="px-4 py-3 font-medium">Trial ends</th>
                <th className="px-4 py-3 font-medium">Pilot ends</th>
                <th className="px-4 py-3 text-right font-medium">Users</th>
                <th className="px-4 py-3 text-right font-medium">Assets</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    No organizations.
                  </td>
                </tr>
              ) : (
                orgs.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orgs/${org.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {org.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{org.slug}</td>
                    <td className="px-4 py-3 text-gray-600">{org.subscription_tier ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{org.subscription_status ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{org.is_pilot ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(org.trial_ends_at)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(org.pilot_end_date)}</td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {userCountByOrg.get(org.id) ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {assetCountByOrg.get(org.id) ?? 0}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(org.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============================ Recent signups ==================== */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Recent signups</h2>
          <span className="text-sm text-gray-500">last 20 users</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {signups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No users.
                  </td>
                </tr>
              ) : (
                signups.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="text-gray-900">{u.email}</span>
                      {looksLikeTestUser(u.email) && (
                        <span
                          className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800"
                          title="Heuristic only - not an authoritative test-account flag"
                        >
                          TEST?
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{u.role}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {u.organization_id
                        ? orgNameById.get(u.organization_id) ?? u.organization_id
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(u.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
