'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AddAssetButton from '@/components/assets/AddAssetButton'
import ImportAssetsButton from '@/components/assets/ImportAssetsButton'
import AssetsTableClient from '@/components/assets/AssetsTableClient'
import Link from 'next/link'
import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

export default function AssetsPageClient() {
    const router = useRouter()
    const supabase = createClient()
    const { language } = useLanguage()
    const t = createTranslator(language)
    
    const [assets, setAssets] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    
    // Search and filter states
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [categoryFilter, setCategoryFilter] = useState<string>('all')
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 50

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
                .select(`
                    *,
                    asset_categories (
                        id,
                        name,
                        color
                    )
                `)
                .eq('organization_id', userData.organization_id)
                .order('created_at', { ascending: false })

            setAssets(data || [])
        } finally {
            setLoading(false)
        }
    }

    // Filter and search logic
    const filteredAssets = useMemo(() => {
        let filtered = assets

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(asset => asset.status === statusFilter)
        }

        // Category filter
        if (categoryFilter !== 'all') {
            filtered = filtered.filter(asset => asset.category_id === categoryFilter)
        }

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            filtered = filtered.filter(asset =>
                asset.name?.toLowerCase().includes(query) ||
                asset.serial_number?.toLowerCase().includes(query) ||
                asset.description?.toLowerCase().includes(query) ||
                asset.current_location?.toLowerCase().includes(query)
            )
        }

        return filtered
    }, [assets, searchQuery, statusFilter, categoryFilter])

    // Pagination
    const totalPages = Math.ceil(filteredAssets.length / itemsPerPage)
    const paginatedAssets = filteredAssets.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    )

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1)
    }, [searchQuery, statusFilter, categoryFilter])

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {
            all: assets.length,
            available: 0,
            in_use: 0,
            maintenance: 0,
            retired: 0
        }
        assets.forEach(asset => {
            if (counts[asset.status] !== undefined) {
                counts[asset.status]++
            }
        })
        return counts
    }, [assets])

    const categories = useMemo(() => {
        const catMap = new Map<string, { id: string, name: string, count: number }>()
        assets.forEach(asset => {
            if (asset.category_id) {
                const existing = catMap.get(asset.category_id)
                if (existing) {
                    existing.count++
                } else {
                    catMap.set(asset.category_id, {
                        id: asset.category_id,
                        name: asset.asset_categories?.name || 'Unknown',
                        count: 1
                    })
                }
            }
        })
        return Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name))
    }, [assets])

    // Helper to get translated status
    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'available': return t('assets.statusAvailable')
            case 'in_use': return t('assets.statusInUse')
            case 'maintenance': return t('assets.statusMaintenance')
            case 'retired': return t('assets.statusRetired')
            default: return status
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
                    <h1 className="text-3xl font-bold text-gray-900">{t('assets.pageTitle')}</h1>
                    <p className="text-gray-600 mt-1">
                        {t('assets.pageSubtitle')}
                    </p>
                </div>
                <div className="flex gap-3">
                    <ImportAssetsButton />
                    <AddAssetButton onSuccess={loadAssets} />
                    <Link 
                        href="/qr-codes" 
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="3" y="3" width="7" height="7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <rect x="14" y="3" width="7" height="7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <rect x="14" y="14" width="7" height="7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <rect x="3" y="14" width="7" height="7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {t('assets.bulkQrCodes')}
                    </Link>
                </div>
            </div>

            {assets.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
                    <h3 className="mt-2 text-sm font-semibold text-gray-900">{t('assets.noAssets')}</h3>
                    <p className="mt-1 text-sm text-gray-500">{t('assets.noAssetsDescription')}</p>
                </div>
            ) : (
                <>
                    {/* Search and Filter Bar */}
                    <div className="bg-white rounded-lg shadow mb-4 p-4">
                        <div className="flex flex-col md:flex-row gap-4">
                            {/* Search */}
                            <div className="flex-1 relative">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder={t('assets.searchPlaceholder')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            {/* Status Filter */}
                            <div className="flex items-center gap-2">
                                <FunnelIcon className="h-5 w-5 text-gray-400" />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                >
                                    <option value="all">{t('assets.allStatus')} ({statusCounts.all})</option>
                                    <option value="available">{t('assets.statusAvailable')} ({statusCounts.available})</option>
                                    <option value="in_use">{t('assets.statusInUse')} ({statusCounts.in_use})</option>
                                    <option value="maintenance">{t('assets.statusMaintenance')} ({statusCounts.maintenance})</option>
                                    <option value="retired">{t('assets.statusRetired')} ({statusCounts.retired})</option>
                                </select>
                            </div>

                            {/* Category Filter */}
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            >
                                <option value="all">{t('assets.allCategories')} ({assets.length})</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name} ({cat.count})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Assets Table */}
                    {filteredAssets.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-900">{t('assets.noAssetsFound')}</h3>
                            <p className="mt-1 text-sm text-gray-500">{t('assets.adjustFilters')}</p>
                        </div>
                    ) : (
                        <>
                            <AssetsTableClient assets={paginatedAssets} />

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="mt-4 flex items-center justify-between bg-white px-4 py-3 rounded-lg shadow">
                                    <div className="text-sm text-gray-700">
                                        {t('assets.showing')} {((currentPage - 1) * itemsPerPage) + 1} {t('assets.to')} {Math.min(currentPage * itemsPerPage, filteredAssets.length)} {t('assets.of')} {filteredAssets.length} {t('assets.results')}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                                        >
                                            {t('assets.previous')}
                                        </button>
                                        <div className="flex items-center gap-1">
                                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                let pageNum
                                                if (totalPages <= 5) {
                                                    pageNum = i + 1
                                                } else if (currentPage <= 3) {
                                                    pageNum = i + 1
                                                } else if (currentPage >= totalPages - 2) {
                                                    pageNum = totalPages - 4 + i
                                                } else {
                                                    pageNum = currentPage - 2 + i
                                                }
                                                return (
                                                    <button
                                                        key={pageNum}
                                                        onClick={() => setCurrentPage(pageNum)}
                                                        className={`px-3 py-1 border rounded-md ${
                                                            currentPage === pageNum
                                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                                : 'border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {pageNum}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                                        >
                                            {t('assets.next')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    )
}