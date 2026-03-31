// app/(dashboard)/layout.tsx
import Sidebar from '@/components/Sidebar'
import { ThemeProvider } from '@/lib/ThemeContext'
import PilotBanner from '@/components/dashboard/PilotBanner'
import AccountLockedOverlay from '@/components/dashboard/AccountLockedOverlay'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider>
      <div className="flex h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
        <Sidebar />
        {/* Immutable brand divider: vertical on desktop, horizontal on mobile */}
        <div className="hidden md:block w-[3px] flex-shrink-0 bg-[#e8600a]" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="block md:hidden h-[3px] flex-shrink-0 bg-[#e8600a]" />
          <PilotBanner />
          <main className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--page-bg)' }}>
            <AccountLockedOverlay>
              {children}
            </AccountLockedOverlay>
          </main>
        </div>
      </div>
    </ThemeProvider>
  )
}
