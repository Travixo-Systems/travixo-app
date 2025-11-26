'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import BulkQRGenerator from '@/components/assets/BulkQRGenerator'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

export default function QRCodesPageClient() {
    const router = useRouter()
    const supabase = createClient()
    const { language } = useLanguage()
    const t = createTranslator(language)
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
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{t('assets.qrGeneratorTitle')}</h1>
                    <p className="text-gray-600 mt-1">{t('assets.qrGeneratorSubtitle')}</p>
                </div>
                <a
                    href="/assets"
                    className="px-4 py-2 text-indigo-600 hover:text-indigo-700 font-medium"
                >
                    {t('assets.backToEquipment')}
                </a>
            </div>

            {assets.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
                    <h3 className="mt-2 text-sm font-semibold text-gray-900">{t('assets.noAssetsFound')}</h3>
                    <p className="mt-1 text-sm text-gray-500">{t('assets.addEquipmentFirst')}</p>
                    <div className="mt-6">
                        <a
                            href="/assets"
                            className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                        >
                            {t('assets.buttonAddAsset')}
                        </a>
                    </div>
                </div>
            ) : (
                <BulkQRGenerator assets={assets} />
            )}
        </div>
    )
}