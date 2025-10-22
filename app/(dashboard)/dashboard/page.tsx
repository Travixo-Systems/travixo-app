import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  // Check if user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user's organization info
  const { data: userData } = await supabase
    .from('users')
    .select(`
      *,
      organizations (
        name,
        subscription_tier
      )
    `)
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">
              Dashboard
            </h1>
            <button
              onClick={async () => {
                'use server'
                const supabase = await createClient()
                await supabase.auth.signOut()
                redirect('/login')
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Welcome to TraviXO!
          </h2>
          
          <div className="space-y-2 text-gray-600">
            <p>Signed in as: <span className="font-medium">{user.email}</span></p>
            {userData?.organizations && (
              <p>Organization: <span className="font-medium">{userData.organizations.name}</span></p>
            )}
            <p>Plan: <span className="font-medium">{userData?.organizations?.subscription_tier || 'Trial'}</span></p>
          </div>

          <div className="mt-8 p-4 bg-orange-50 rounded-lg">
            <h3 className="font-semibold text-orange-900 mb-2">
              Next Steps:
            </h3>
            <ul className="space-y-1 text-sm text-orange-800">
              <li>• Add your first asset</li>
              <li>• Generate QR codes</li>
              <li>• Invite team members</li>
              <li>• Run your first audit</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  )
}