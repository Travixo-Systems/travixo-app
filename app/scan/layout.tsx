import { OfflineErrorBoundary } from '@/components/offline/OfflineErrorBoundary'

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return <OfflineErrorBoundary>{children}</OfflineErrorBoundary>
}
