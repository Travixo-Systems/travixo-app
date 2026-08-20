'use client'

// app/(admin)/admin/AdminLogoutButton.tsx
// Client island for the admin header's sign-out control. The layout is a
// server component, so the button lives here.
//
// After signOut() the session cookie is cleared; we navigate to the login
// page and refresh so every server component re-renders against the now
// signed-out session (requireSuperAdmin() would otherwise still see the
// cached render).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
import { createClient } from '@/lib/supabase/client'

export default function AdminLogoutButton() {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-2.5 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
      {loggingOut ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
