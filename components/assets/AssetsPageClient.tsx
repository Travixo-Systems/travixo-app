// components/assets/AssetsPageClient.tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import AddAssetButton from '@/components/assets/AddAssetButton'
import ImportAssetsButton from '@/components/assets/ImportAssetsButton'
import AssetsTableClient from '@/components/assets/AssetsTableClient'
import Link from 'next/link'
import { MagnifyingGlassIcon, FunnelIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

interface Asset {
    id: string
    name: string
    serial_number: string | null
    description: string | null
    status: string
    current_location: string | null
    category_id: string | null
    // Not shown in the table, but the row modals need them: ViewQRModal
    // reads qr_code, EditAssetModal reads the purchase fields.
    qr_code: string
    purchase_date: string | null
    purchase_price: number | null
    current_value: number | null
    vgp_status?: 'overdue' | 'upcoming' | 'compliant' | 'unknown' | null
    archived_at?: string | null
    archive_reason?: string | null
    asset_categories?: {
        id: string
        name: string
    } | null
    vgp_schedules?: {
        id: string
        next_due_date: string
    }[] | null
}

const VALID_STATUSES = ['all', 'available', 'in_use', 'maintenance', 'retired']

export default function AssetsPageClient() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const { language } = useLanguage()
    const t = createTranslator(language)

    const statusParam = searchParams.get('status')
    const initialStatus = statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : 'all'
    const initialCategory = searchParams.get('category') || 'all'

    const [assets, setAssets] = useState<Asset[]>([])
    const [loading, setLoading] = useState(true)

    // Total matching the CURRENT filters, from the server. The pager needs it,
    // and it can no longer be derived from `assets` because `assets` is one
    // page rather than the whole fleet.
    const [totalMatching, setTotalMatching] = useState(0)

    // Fleet-wide figures, fetched separately from the page of rows.
    //
    // These describe the whole organization, not the visible page, which is
    // exactly why they cannot be computed from `assets` any more. Deriving them
    // client-side is what forced the list to stay unpaginated.
    const [statusCounts, setStatusCounts] = useState<Record<string, number>>({
        all: 0, available: 0, in_use: 0, maintenance: 0, retired: 0,
    })
    const [categories, setCategories] = useState<{ id: string; name: string; count: number }[]>([])

    // Search and filter states
    const [searchQuery, setSearchQuery] = useState('')
    // Debounced copy of searchQuery. The search now hits the server, so firing
    // on every keystroke would be a request per character.
    const [debouncedSearch, setDebouncedSearch] = useState('')
    // Seeded from ?status= so links like "view rentals" land on a real filtered
    // list instead of an unfiltered page the user has to re-filter by hand.
    const [statusFilter, setStatusFilter] = useState<string>(initialStatus)
    const [categoryFilter, setCategoryFilter] = useState<string>(initialCategory)
    const [showArchived, setShowArchived] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 50

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // Re-fetch the page whenever anything that defines it changes. The server
    // does the filtering, searching and slicing now, so every one of these is
    // a query parameter rather than an in-memory filter.
    useEffect(() => {
        loadAssets()
    }, [debouncedSearch, statusFilter, categoryFilter, showArchived, currentPage])

    // Fleet-wide aggregates change only when rows are added, removed or
    // archived, so they are refreshed on mount and after a mutation rather
    // than on every filter change.
    useEffect(() => {
        loadAggregates()
    }, [])

    async function loadAssets() {
        try {
            // One call: the server filters, searches, computes vgp_status and
            // slices. Everything the table needs arrives already reduced to the
            // visible page, instead of the whole fleet arriving so the browser
            // can throw most of it away.
            const { data, error } = await supabase.rpc('assets_page', {
                p_search: debouncedSearch.trim() || null,
                p_status: statusFilter,
                p_category_id: categoryFilter === 'all' ? null : categoryFilter,
                p_show_archived: showArchived,
                p_limit: itemsPerPage,
                p_offset: (currentPage - 1) * itemsPerPage,
            })

            if (error) {
                // A 42501 here means the session is gone: the function is
                // granted to authenticated only, so an expired token reads as
                // a permission failure rather than a 401.
                if (error.code === '42501') {
                    router.push('/login')
                    return
                }
                console.error('Failed to load assets:', error)
                setAssets([])
                setTotalMatching(0)
                return
            }

            const rows = data || []

            // total_count is a window function on every row, so it is the same
            // value repeated. An empty page legitimately means zero matches.
            setTotalMatching(rows.length > 0 ? Number(rows[0].total_count) : 0)

            setAssets(rows.map((r) => ({
                id: r.id,
                name: r.name,
                serial_number: r.serial_number,
                description: r.description,
                status: r.status,
                current_location: r.current_location,
                category_id: r.category_id,
                qr_code: r.qr_code,
                purchase_date: r.purchase_date,
                purchase_price: r.purchase_price,
                current_value: r.current_value,
                archived_at: r.archived_at,
                archive_reason: r.archive_reason,
                vgp_status: r.vgp_status,
                // The table reads asset_categories?.name; the RPC returns it
                // flattened, so it is reshaped here rather than changing the
                // table's contract.
                asset_categories: r.category_id
                    ? { id: r.category_id, name: r.category_name }
                    : null,
            })) as Asset[])
        } finally {
            setLoading(false)
        }
    }

    // After a mutation the visible page AND the fleet-wide figures both need
    // to change: adding an asset moves the status chips and the category
    // counts, not just the rows on screen. Refreshing only the page would
    // leave those numbers quietly wrong until the next full load.
    async function refreshAll() {
        await Promise.all([loadAssets(), loadAggregates()])
    }

    async function loadAggregates() {
        // Fleet-wide, deliberately independent of the current filters.
        const [countsRes, catsRes] = await Promise.all([
            supabase.rpc('assets_status_counts'),
            supabase.rpc('assets_category_counts'),
        ])

        if (!countsRes.error && countsRes.data) {
            const next: Record<string, number> = {
                all: 0, available: 0, in_use: 0, maintenance: 0, retired: 0,
            }
            for (const row of countsRes.data) {
                const n = Number(row.count)
                if (next[row.status] !== undefined) next[row.status] = n
                // 'all' is every non-archived asset, matching what the chip
                // meant when it was computed client-side.
                next.all += n
            }
            setStatusCounts(next)
        }

        if (!catsRes.error && catsRes.data) {
            setCategories(catsRes.data.map((c) => ({
                id: c.id, name: c.name, count: Number(c.count),
            })))
        }
    }

    // Filter and search logic
    // Pagination is server-side now:  IS the page, and totalMatching
    // is the count for the current filters. Nothing is sliced here.
    const totalPages = Math.max(1, Math.ceil(totalMatching / itemsPerPage))

    // Reset to page 1 when filters change, or a filter narrowing the result set
    // would leave the user on a page that no longer exists.
    useEffect(() => {
        setCurrentPage(1)
    }, [debouncedSearch, statusFilter, categoryFilter, showArchived])

    // A ?category= id that matches nothing (deleted category, stale bookmark)
    // would otherwise render an empty table with no visible filter selected.
    // Fall back to "all" once the real category list is known.
    //
    // Keyed on the CATEGORY list, not on assets.length. It used to wait for
    // rows to arrive, which worked while the client held the whole fleet: a
    // bogus category still left assets populated. Now a bogus category returns
    // an empty page, so waiting for rows would mean the fallback never fires
    // and the user is stranded on a blank table.
    useEffect(() => {
        if (categoryFilter === 'all' || categories.length === 0) return
        if (!categories.some(c => c.id === categoryFilter)) {
            setCategoryFilter('all')
        }
    }, [categories, categoryFilter])

    if (loading) {
        return (
            <div className="p-3 md:p-6 flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#e8600a]"></div>
            </div>
        )
    }

    return (
        <div className="p-3 md:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-[18px] min-[1026px]:text-[22px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('assets.pageTitle')}</h1>
                    <p className="mt-1 text-[14px]" style={{ color: 'var(--text-muted, #777777)' }}>
                        {t('assets.pageSubtitle')}
                    </p>
                </div>
                <div className="flex gap-2 sm:gap-3 flex-wrap ml-auto sm:ml-0">
                    <div className="hidden min-[1026px]:block">
                        <ImportAssetsButton onSuccess={refreshAll} />
                    </div>
                    <AddAssetButton onSuccess={refreshAll} />
                    <Link
                        href="/qr-codes"
                        className="hidden sm:flex items-center gap-2 px-4 py-2 text-white rounded-lg font-semibold transition-colors hover:opacity-90"
                        style={{ backgroundColor: 'var(--accent-fill, #a84605)' }}
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
                    <div className="rounded-lg mb-4 p-3 min-[1026px]:p-4" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
                        {/* Search, always full width */}
                        <div className="relative mb-3 min-[1026px]:mb-0">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5" style={{ color: 'var(--text-hint, #888888)' }} />
                            <input
                                type="text"
                                placeholder={t('assets.searchPlaceholder')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 rounded-md text-[14px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a] min-h-[44px]"
                                style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                            />
                        </div>

                        {/* Filters, stack on mobile, row on desktop */}
                        <div className="flex flex-col sm:flex-row gap-2 min-[1026px]:mt-3">
                            <div className="flex items-center gap-2 flex-1">
                                <FunnelIcon className="h-5 w-5 flex-shrink-0 hidden sm:block" style={{ color: 'var(--text-hint, #888888)' }} />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full sm:w-auto text-[14px] min-h-[44px] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
                                    style={{
                                        appearance: 'none',
                                        WebkitAppearance: 'none',
                                        backgroundColor: 'var(--card-bg, #edeff2)',
                                        color: 'var(--text-secondary, #444444)',
                                        border: '0.5px solid #c0c0c0',
                                        padding: '10px 36px 10px 14px',
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                        backgroundRepeat: 'no-repeat',
                                        backgroundPosition: 'right 12px center',
                                    }}
                                >
                                    <option value="all">{t('assets.allStatus')} ({statusCounts.all})</option>
                                    <option value="available">{t('assets.statusAvailable')} ({statusCounts.available})</option>
                                    <option value="in_use">{t('assets.statusInUse')} ({statusCounts.in_use})</option>
                                    <option value="maintenance">{t('assets.statusMaintenance')} ({statusCounts.maintenance})</option>
                                    <option value="retired">{t('assets.statusRetired')} ({statusCounts.retired})</option>
                                </select>
                            </div>

                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="w-full sm:w-auto text-[14px] min-h-[44px] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
                                style={{
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    backgroundColor: 'var(--card-bg, #edeff2)',
                                    color: 'var(--text-secondary, #444444)',
                                    border: '0.5px solid #c0c0c0',
                                    padding: '10px 36px 10px 14px',
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'right 12px center',
                                }}
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

                    {/* Archived toggle */}
                    <div className="flex items-center justify-end mb-2">
                        <button
                            onClick={() => setShowArchived(!showArchived)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors"
                            style={{
                                color: showArchived ? 'var(--accent-text, #b04a06)' : 'var(--text-muted, #5f5f5f)',
                                backgroundColor: showArchived ? 'rgba(232, 96, 10, 0.08)' : 'transparent',
                            }}
                        >
                            {showArchived
                                ? <EyeSlashIcon className="h-4 w-4" />
                                : <EyeIcon className="h-4 w-4" />
                            }
                            {language === 'fr' ? 'Afficher les retirés' : 'Show retired'}
                        </button>
                    </div>

                    {/* Assets Table */}
                    {totalMatching === 0 ? (
                        <div className="text-center py-12 rounded-lg" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
                            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('assets.noAssetsFound')}</h3>
                            <p className="mt-1 text-[15px]" style={{ color: 'var(--text-muted, #777777)' }}>{t('assets.adjustFilters')}</p>
                        </div>
                    ) : (
                        <>
                            <AssetsTableClient assets={assets} onRefresh={refreshAll} />

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="mt-4 flex items-center justify-between px-4 py-3 rounded-lg" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
                                    <div className="text-[15px]" style={{ color: 'var(--text-secondary, #444444)' }}>
                                        {t('assets.showing')} {((currentPage - 1) * itemsPerPage) + 1} {t('assets.to')} {Math.min(currentPage * itemsPerPage, totalMatching)} {t('assets.of')} {totalMatching} {t('assets.results')}
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
                                                                ? 'text-white border-[#a84605] bg-[#a84605]'
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