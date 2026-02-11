// app/(dashboard)/layout.tsx
import Sidebar from '@/components/Sidebar'
import { ThemeProvider } from '@/lib/ThemeContext'
import PilotBanner from '@/components/dashboard/PilotBanner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider>
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <PilotBanner />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  )
}
