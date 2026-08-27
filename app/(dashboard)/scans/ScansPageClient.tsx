'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { QrCode, Search, MapPin, Loader2, ArrowRightLeft, ClipboardCheck, LogIn, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

const PAGE_SIZE = 50

type RangeFilter = '7d' | '30d' | 'all'
type TypeFilter = 'all' | 'check' | 'inventory' | 'checkout' | 'return'

interface ScanRow {
  id: string
  asset_id: string
  scan_type: string | null
  location_name: string | null
  scanned_at: string
  assets: { name: string | null; serial_number: string | null } | null
  users: { first_name: string | null; last_name: string | null } | null
}

/** Visual treatment per scan type, keyed to the same palette as the rest of the app. */
/* Each type already carries its own icon, so status never rests on hue alone.
   Inks are the darkened variants that clear 4.5:1 against these tints. */
const TYPE_STYLES: Record<string, { bg: string; color: string; icon: typeof QrCode }> = {
  checkout: { bg: '#ebe0d5', color: '#8a4b03', icon: LogOut },
  return: { bg: '#d1e3e1', color: '#036143', icon: LogIn },
  inventory: { bg: '#dfe2e6', color: '#3f4650', icon: ClipboardCheck },
  check: { bg: '#dfe2e6', color: '#3f4650', icon: ArrowRightLeft },
}

export default function ScansPageClient() {
  const { language } = useLanguage()
  const t = createTranslator(language)

  const [scans, setScans] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<RangeFilter>('30d')
  const [type, setType] = useState<TypeFilter>('all')

  const load = useCallback(
    async (offset: number, replace: boolean) => {
      const supabase = createClient()

      // RLS scopes scans to the caller's organization.
      let query = supabase
        .from('scans')
        .select(`
          id,
          asset_id,
          scan_type,
          location_name,
          scanned_at,
          assets ( name, serial_number ),
          users ( first_name, last_name )
        `)
        .order('scanned_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (range !== 'all') {
        const since = new Date()
        since.setDate(since.getDate() - (range === '7d' ? 7 : 30))
        query = query.gte('scanned_at', since.toISOString())
      }

      if (type !== 'all') {
        query = query.eq('scan_type', type)
      }

      const { data, error } = await query

      if (error) {
        console.error('Scan fetch error:', error)
        setHasMore(false)
        return
      }

      const rows = (data || []) as unknown as ScanRow[]
      setHasMore(rows.length === PAGE_SIZE)
      setScans((prev) => (replace ? rows : [...prev, ...rows]))
    },
    [range, type]
  )

  useEffect(() => {
    setLoading(true)
    load(0, true).finally(() => setLoading(false))
  }, [load])

  async function loadMore() {
    setLoadingMore(true)
    await load(scans.length, false)
    setLoadingMore(false)
  }

  // Search is applied client-side over the loaded page: it spans the joined
  // asset name and the location, which a single server-side filter cannot cover.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scans
    return scans.filter((s) => {
      const name = s.assets?.name?.toLowerCase() || ''
      const serial = s.assets?.serial_number?.toLowerCase() || ''
      const loc = s.location_name?.toLowerCase() || ''
      return name.includes(q) || serial.includes(q) || loc.includes(q)
    })
  }, [scans, search])

  const typeLabel = (v: string | null) => {
    switch (v) {
      case 'check': return t('scans.typeCheck')
      case 'inventory': return t('scans.typeInventory')
      case 'checkout': return t('scans.typeCheckout')
      case 'return': return t('scans.typeReturn')
      default: return v || '-'
    }
  }

  const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  const userName = (u: ScanRow['users']) => {
    if (!u) return null
    const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
    return full || null
  }

  const ranges: { key: RangeFilter; label: string }[] = [
    { key: '7d', label: t('scans.last7Days') },
    { key: '30d', label: t('scans.last30Days') },
    { key: 'all', label: t('scans.allTime') },
  ]

  const types: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: t('scans.typeAll') },
    { key: 'checkout', label: t('scans.typeCheckout') },
    { key: 'return', label: t('scans.typeReturn') },
    { key: 'inventory', label: t('scans.typeInventory') },
    { key: 'check', label: t('scans.typeCheck') },
  ]

  return (
    <div className="p-3 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[18px] lg:text-[22px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
          {t('scans.pageTitle')}
        </h1>
        <p className="text-[15px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
          {t('scans.pageSubtitle')}
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-hint, #888)' }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('scans.searchPlaceholder')}
          className="w-full pl-10 pr-4 py-3 rounded-lg font-medium border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
          style={{ fontSize: '16px', backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-2">
        {ranges.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className="px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors"
            style={
              range === r.key
                ? { backgroundColor: 'var(--accent-fill, #a84605)', color: '#fff' }
                : { backgroundColor: 'var(--card-bg, #edeff2)', color: 'var(--text-secondary, #444)' }
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {types.map((ty) => (
          <button
            key={ty.key}
            onClick={() => setType(ty.key)}
            className="px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors"
            style={
              type === ty.key
                ? { backgroundColor: 'var(--text-primary, #1a1a1a)', color: '#fff' }
                : { backgroundColor: 'var(--card-bg, #edeff2)', color: 'var(--text-secondary, #444)' }
            }
          >
            {ty.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : scans.length === 0 ? (
        <div className="text-center py-16">
          <div
            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}
          >
            <QrCode className="w-8 h-8" style={{ color: 'var(--text-hint, #888)' }} />
          </div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
            {t('scans.noScans')}
          </h3>
          <p className="text-[15px] max-w-md mx-auto" style={{ color: 'var(--text-muted, #777)' }}>
            {t('scans.noScansDescription')}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-[14px] py-12 text-center" style={{ color: 'var(--text-muted, #777)' }}>
          {t('scans.noResults')}
        </p>
      ) : (
        <>
          <p className="text-[12px] mb-2" style={{ color: 'var(--text-hint, #888)' }}>
            {visible.length} {t('scans.totalScans')}
          </p>

          <div className="space-y-1.5 animate-enter" key={`${range}-${type}`}>
            {visible.map((s) => {
              const style = TYPE_STYLES[s.scan_type || ''] || TYPE_STYLES.check
              const Icon = style.icon
              const who = userName(s.users)

              return (
                // Whole row links to the asset - the scan itself has no detail page.
                <Link
                  key={s.id}
                  href={`/assets/${s.asset_id}`}
                  className="flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-black/[0.04] transition-colors"
                  style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}
                >
                  <span
                    className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0"
                    style={{ backgroundColor: style.bg }}
                  >
                    <Icon className="w-4 h-4" style={{ color: style.color }} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium truncate" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {s.assets?.name || '-'}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                      <span
                        className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: style.bg, color: style.color }}
                      >
                        {typeLabel(s.scan_type)}
                      </span>
                      <span className="text-[12px] inline-flex items-center gap-1" style={{ color: 'var(--text-muted, #777)' }}>
                        <MapPin className="w-3 h-3" />
                        {s.location_name || t('scans.noLocation')}
                      </span>
                      {who && (
                        <span className="text-[12px]" style={{ color: 'var(--text-muted, #777)' }}>
                          {t('scans.scannedBy')} {who}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-[12px] flex-shrink-0" style={{ color: 'var(--text-muted, #777)' }}>
                    {formatWhen(s.scanned_at)}
                  </span>
                </Link>
              )
            })}
          </div>

          {hasMore && !search && (
            <div className="flex justify-center mt-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[14px] font-medium disabled:opacity-50"
                style={{ backgroundColor: 'var(--card-bg, #edeff2)', color: 'var(--text-secondary, #444)' }}
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('scans.loadMore')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
