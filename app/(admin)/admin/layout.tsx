// app/(admin)/admin/layout.tsx
// Gates EVERY /admin route. requireSuperAdmin() redirects any
// non-super_admin to '/', so child pages can assume the caller is a
// verified platform admin.

import Link from 'next/link'
import { requireSuperAdmin } from '@/lib/auth/requireSuperAdmin'
import AdminLogoutButton from './AdminLogoutButton'

export const metadata = {
  title: 'Platform Admin',
}

// Always render dynamically: admin data is cross-tenant and must never
// be cached or statically prerendered.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { email } = await requireSuperAdmin()

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-lg font-semibold">
              TraviXO Platform Admin
            </Link>
            <nav className="flex items-center gap-4 text-sm text-gray-600">
              <Link href="/admin" className="hover:text-gray-900">
                Organizations
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span className="flex items-center">
              {email}
              <span className="ml-2 rounded bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
                platform_admin
              </span>
            </span>
            <AdminLogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}
