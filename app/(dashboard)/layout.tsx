// app/(dashboard)/layout.tsx
import Sidebar from '@/components/Sidebar'
import { ThemeProvider } from '@/lib/ThemeContext'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider>
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </ThemeProvider>
  )
}