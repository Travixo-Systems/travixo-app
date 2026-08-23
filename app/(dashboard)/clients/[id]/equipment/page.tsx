import { Suspense } from 'react'
import EquipmentPageClient from './EquipmentPageClient'

// EquipmentPageClient reads ?filter= via useSearchParams, which requires a
// Suspense boundary during prerendering.
export default function ClientEquipmentPage() {
  return (
    <Suspense fallback={null}>
      <EquipmentPageClient />
    </Suspense>
  )
}
