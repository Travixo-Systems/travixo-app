'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AddAssetButton from '@/components/assets/AddAssetButton'
import ImportAssetsButton from '@/components/assets/ImportAssetsButton'
import AssetsTableClient from '@/components/assets/AssetsTableClient'
import Link from 'next/link'


export default function AssetsPageClient() {
    const router = useRouter()
    const supabase = createClient()
    const [assets, setAssets] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadAssets()
    }, [])

    async function loadAssets() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            const { data: userData } = await supabase
                .from('users')
                .select('organization_id')
                .eq('id', user.id)
                .single()

            if (!userData?.organization_id) return

            const { data } = await supabase
                .from('assets')
                .select('*')
                .eq('organization_id', userData.organization_id)
                .order('created_at', { ascending: false })

            setAssets(data || [])
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="p-8 flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        )
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Assets</h1>
                    <p className="text-gray-600 mt-1">Manage and track your equipment inventory</p>
                </div>
                <div className="flex gap-3">
                    <ImportAssetsButton />
                    <AddAssetButton onSuccess={loadAssets} />
                    <Link href="/qr-codes" className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-colors">
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="14" y="3" width="7" height="7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="14" y="14" width="7" height="7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="3" y="14" width="7" height="7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    Bulk QR Codes
</Link>
             
                </div>
            </div>

            {assets.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
                    <h3 className="mt-2 text-sm font-semibold text-gray-900">No assets</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by adding your first piece of equipment.</p>
                </div>
            ) : (
                <AssetsTableClient assets={assets} />
            )}
        </div>
    )
}