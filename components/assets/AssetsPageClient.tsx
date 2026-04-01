// components/assets/AssetsPageClient.tsx
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

interface Asset {
    id: string
    name: string
    serial_number: string | null
    description: string | null
    status: string
    current_location: string | null
    purchase_date: string | null
    purchase_price: number | null
    current_value: number | null
    qr_code: string
    category_id: string | null
    vgp_status?: 'overdue' | 'upcoming' | 'compliant' | 'unknown' | null
    asset_categories?: {
        id: string
        name: string
        color: string
    } | null
    vgp_schedules?: {
        id: string
        next_due_date: string
    }[] | null
}

export default function AssetsPageClient() {
    const router = useRouter()
    const supabase = createClient()
    const { language } = useLanguage()
    const t = createTranslator(language)
    
    const [assets, setAssets] = useState<Asset[]>([])
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

            const { data, error } = await supabase
                .from('assets')
                .select(`
                    *,
                    asset_categories (
                        id,
                        name,
                        color
                    ),
                    vgp_schedules (
                        id,
                        next_due_date,
                        archived_at
                    )
                `)
                .eq('organization_id', userData.organization_id)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Failed to load assets with VGP schedules:', error)
            }

            // Compute vgp_status from the most urgent active schedule
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const enriched = (data || []).map((asset: any) => {
                const allSchedules = asset.vgp_schedules as { id: string; next_due_date: string; archived_at: string | null }[] | null
                const schedules = allSchedules?.filter(s => !s.archived_at) ?? []
                if (schedules.length === 0) {
                    return { ...asset, vgp_status: 'unknown' as const }
                }
                // Find the most urgent (nearest) schedule
                let worstStatus: 'overdue' | 'upcoming' | 'compliant' = 'compliant'
                for (const s of schedules) {
                    const due = new Date(s.next_due_date)
                    due.setHours(0, 0, 0, 0)
                    const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                    if (daysUntil < 0) {
                        worstStatus = 'overdue'
                        break // can't get worse
                    } else if (daysUntil <= 30) {
                        worstStatus = 'upcoming'
                    }
                }
                return { ...asset, vgp_status: worstStatus }
            })

            setAssets(enriched as Asset[])
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

    if (loading) {
        return (
            <div className="p-3 md:p-6 flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#e8600a]"></div>
            </div>
        )
    }

    return (
        <div className="p-3 md:p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-[22px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('assets.pageTitle')}</h1>
                    <p className="mt-1" style={{ color: 'var(--text-muted, #777777)' }}>
                        {t('assets.pageSubtitle')}
                    </p>
                </div>
                <div className="flex gap-3">
                    <ImportAssetsButton onSuccess={loadAssets} />
                    <AddAssetButton onSuccess={loadAssets} />
                    <Link
                        href="/qr-codes"
                        className="flex items-center gap-2 px-4 py-2 text-white rounded-lg font-semibold transition-colors hover:opacity-90"
                        style={{ backgroundColor: 'var(--accent, #e8600a)' }}
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
                <div className="text-center py-12 rounded-lg border-2 border-dashed" style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderColor: '#b8b8b8' }}>
                    <h3 className="mt-2 text-[15px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('assets.noAssets')}</h3>
                    <p className="mt-1 text-[15px]" style={{ color: 'var(--text-muted, #777777)' }}>{t('assets.noAssetsDescription')}</p>
                </div>
            ) : (
                <>
                    {/* Search and Filter Bar */}
                    <div className="rounded-lg mb-4 p-4" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
                        <div className="flex flex-col md:flex-row gap-4">
                            {/* Search */}
                            <div className="flex-1 relative">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5" style={{ color: 'var(--text-hint, #888888)' }} />
                                <input
                                    type="text"
                                    placeholder={t('assets.searchPlaceholder')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 rounded-md text-[14px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
                                    style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                                />
                            </div>

                            {/* Status Filter */}
                            <div className="flex items-center gap-2">
                                <FunnelIcon className="h-5 w-5" style={{ color: 'var(--text-hint, #888888)' }} />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="px-4 py-2 rounded-md text-[14px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
                                    style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-secondary, #444444)' }}
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
                                className="px-4 py-2 rounded-md text-[14px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
                                style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-secondary, #444444)' }}
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
                        <div className="text-center py-12 rounded-lg" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
                            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('assets.noAssetsFound')}</h3>
                            <p className="mt-1 text-[15px]" style={{ color: 'var(--text-muted, #777777)' }}>{t('assets.adjustFilters')}</p>
                        </div>
                    ) : (
                        <>
                            <AssetsTableClient assets={paginatedAssets} onRefresh={loadAssets} />

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="mt-4 flex items-center justify-between px-4 py-3 rounded-lg" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
                                    <div className="text-[15px]" style={{ color: 'var(--text-secondary, #444444)' }}>
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
                                                                ? 'text-white border-[#e8600a] bg-[#e8600a]'
                                                                : 'border-gray-300 hover:bg-black/[0.03]'
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