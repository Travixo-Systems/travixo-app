// app/(admin)/admin/layout.tsx
// Gates EVERY /admin route. requireSuperAdmin() redirects any non-super_admin
// to '/', so child pages can assume the caller is a verified platform admin.
//
// The shell carries the console's visual language: the --page-bg ground, a
// dark --sidebar-bg header, and the 3px brand rail from DESIGN_SPEC.md. The
// rail is horizontal here rather than vertical because the admin console uses
// a top nav; it is the same immutable #e8600a brand element.

import Link from 'next/link'
import { requireSuperAdmin } from '@/lib/auth/requireSuperAdmin'
import AdminLogoutButton from './AdminLogoutButton'
import AdminNav from './AdminNav'

export const metadata = {
  title: 'Platform Admin',
}

// Always render dynamically: admin data is cross-tenant and must never be
// cached or statically prerendered.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { email } = await requireSuperAdmin()

  return (
    <div className="min-h-screen bg-[var(--page-bg,#f6f8fd)] text-[var(--text-primary,#1a1a1a)]">
      <header className="bg-[var(--sidebar-bg,#0a2730)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-6">
            <Link
              href="/admin"
              className="text-[15px] font-semibold text-[var(--accent,#e8600a)]"
            >
              TraviXO
            </Link>
            <AdminNav />
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center text-[12px] text-white/60">
              <span className="hidden sm:inline">{email}</span>
              <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/80">
                platform_admin
              </span>
            </span>
            <AdminLogoutButton />
          </div>
        </div>
      </header>

      {/* The immutable brand rail. 3px, #e8600a, always. */}
      <div className="h-[3px] w-full bg-[var(--accent,#e8600a)]" />

      <main>{children}</main>
    </div>
  )
}
