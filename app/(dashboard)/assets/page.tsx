import { Suspense } from 'react'
import AssetsPageClient from '@/components/assets/AssetsPageClient'

// AssetsPageClient reads ?status= via useSearchParams, which requires a
// Suspense boundary during prerendering.
export default function AssetsPage() {
    return (
        <Suspense fallback={null}>
            <AssetsPageClient />
        </Suspense>
    )
}
