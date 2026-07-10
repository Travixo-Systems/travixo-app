// app/(admin)/admin/orgs/[id]/page.tsx
// Platform-admin org detail: organization fields + users + Phase 2 write
// actions (extend trial/pilot, feature flags) + recent admin audit log.
// Server component. Gated by app/(admin)/admin/layout.tsx.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminOrgActions from './AdminOrgActions'

export const dynamic = 'force-dynamic'

function formatDate(value: string | null): string {
  if (!value) return '-'
  return value.slice(0, 10)
}

function formatDateTime(value: string | null): string {
  if (!value) return '-'
  // YYYY-MM-DD HH:MM (UTC slice), locale-independent.
  return value.slice(0, 16).replace('T', ' ')
}

interface OrgDetail {
  id: string
  name: string
  slug: string
  subscription_tier: string | null
  subscription_status: string | null
  is_pilot: boolean
  trial_ends_at: string | null
  pilot_end_date: string | null
  converted_to_paid: boolean
  feature_flags: Record<string, boolean> | null
  created_at: string
}

interface OrgUser {
  id: string
  email: string
  full_name: string | null
  role: string
  language: string | null
  created_at: string
}

interface AuditRow {
  id: string
  actor_id: string | null
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}

// Compact "before -> after" summary tailored to each audited action.
function summarizeAudit(row: AuditRow): string {
  const before = row.before ?? {}
  const after = row.after ?? {}
  if (row.action === 'extend_trial') {
    const branch = (after as { branch?: string }).branch ?? 'trial'
    const field = branch === 'pilot' ? 'pilot_end_date' : 'trial_ends_at'
    const b = (before as Record<string, string | null>)[field]
    const a = (after as Record<string, string | null>)[field]
    const days = (after as { days?: number }).days
    return `${branch} ${formatDate(b ?? null)} -> ${formatDate(a ?? null)} (+${days ?? '?'}d)`
  }
  if (row.action === 'set_feature_flag') {
    const flag = (after as { flag?: string }).flag ?? '?'
    const enabled = (after as { enabled?: boolean }).enabled
    return `${flag} -> ${enabled ? 'enabled' : 'disabled'}`
  }
  return '-'
}

export default async function AdminOrgDetailPage({
  params,
}: {
  // Next 16: params is a Promise.
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // --- Organization -----------------------------------------------------
  const { data: org } = await supabase
    .from('organizations')
    .select(
      'id, name, slug, subscription_tier, subscription_status, is_pilot, trial_ends_at, pilot_end_date, converted_to_paid, feature_flags, created_at'
    )
    .eq('id', id)
    .single()

  if (!org) {
    notFound()
  }

  const o = org as OrgDetail
  const flags: Record<string, boolean> = o.feature_flags ?? {}

  // --- Users in this org ------------------------------------------------
  const { data: usersData } = await supabase
    .from('users')
    .select('id, email, full_name, role, language, created_at')
    .eq('organization_id', id)
    .order('created_at', { ascending: false })

  const users: OrgUser[] = (usersData as OrgUser[] | null) ?? []

  // --- Recent admin audit log for THIS org ------------------------------
  // target_org_id is captured explicitly by the Phase 2 functions (the
  // admin is org-less, so the acted-on org is never inferred).
  const { data: auditData } = await supabase
    .from('admin_audit_log')
    .select('id, actor_id, action, before, after, created_at')
    .eq('target_org_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  const audit: AuditRow[] = (auditData as AuditRow[] | null) ?? []

  // Resolve actor emails (admins have a users row in B1).
  const actorIds = Array.from(
    new Set(audit.map((a) => a.actor_id).filter((x): x is string => !!x))
  )
  const actorEmailById = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from('users')
      .select('id, email')
      .in('id', actorIds)
    for (const a of (actors as { id: string; email: string }[] | null) ?? []) {
      actorEmailById.set(a.id, a.email)
    }
  }

  const fields: { label: string; value: string }[] = [
    { label: 'Name', value: o.name },
    { label: 'Slug', value: o.slug },
    { label: 'Tier', value: o.subscription_tier ?? '-' },
    { label: 'Status', value: o.subscription_status ?? '-' },
    { label: 'Pilot', value: o.is_pilot ? 'Yes' : 'No' },
    { label: 'Trial ends', value: formatDate(o.trial_ends_at) },
    { label: 'Pilot ends', value: formatDate(o.pilot_end_date) },
    { label: 'Converted to paid', value: o.converted_to_paid ? 'Yes' : 'No' },
    { label: 'Created', value: formatDate(o.created_at) },
    { label: 'Org ID', value: o.id },
  ]

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin" className="text-sm text-blue-700 hover:underline">
          ← Back to organizations
        </Link>
      </div>

      {/* ============================ Org fields ======================== */}
      <section>
        <h1 className="mb-4 text-xl font-semibold">{o.name}</h1>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <dl className="divide-y divide-gray-100">
            {fields.map((f) => (
              <div key={f.label} className="grid grid-cols-3 gap-4 px-4 py-3 text-sm">
                <dt className="font-medium text-gray-500">{f.label}</dt>
                <dd className="col-span-2 text-gray-900">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ============================ Actions =========================== */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Actions</h2>
        <AdminOrgActions orgId={o.id} isPilot={o.is_pilot} flags={flags} />
      </section>

      {/* ============================ Users ============================= */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Users</h2>
          <span className="text-sm text-gray-500">{users.length} total</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Language</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No users in this organization.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{u.email}</td>
                    <td className="px-4 py-3 text-gray-600">{u.full_name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{u.role}</td>
                    <td className="px-4 py-3 text-gray-600">{u.language ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(u.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============================ Audit log ========================= */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Admin activity</h2>
          <span className="text-sm text-gray-500">last 10 actions</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Change</th>
                <th className="px-4 py-3 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {audit.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    No admin actions recorded for this organization.
                  </td>
                </tr>
              ) : (
                audit.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">
                      {formatDateTime(a.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{a.action}</td>
                    <td className="px-4 py-3 text-gray-600">{summarizeAudit(a)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.actor_id
                        ? actorEmailById.get(a.actor_id) ?? a.actor_id
                        : '-'}
                    </td>
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
