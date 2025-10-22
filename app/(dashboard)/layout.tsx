
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // const cookieStore = await cookies()
  // const supabase = createServerComponentClient({ 
  //   cookies: () => cookieStore 
  // })
  
  // const {
  //   data: { session },
  // } = await supabase.auth.getSession()

  // if (!session) {
  //   redirect('/login')
  // }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}