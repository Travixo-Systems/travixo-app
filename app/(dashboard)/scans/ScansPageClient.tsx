'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { QrCode, Search, MapPin, Loader2, ArrowRightLeft, ClipboardCheck, LogIn, LogOut, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import { useDebounce } from '@/lib/search/useDebounce'
import { resolveScanTypes } from '@/lib/search/scanTypes'

const PAGE_SIZE = 50

type RangeFilter = '7d' | '30d' | 'all'
type TypeFilter = 'all' | 'check' | 'inventory' | 'checkout' | 'return'

/**
 * A row as `search_scans` returns it: already flattened, already joined, and
 * carrying the provenance of the match.
 *
 * The page no longer receives nested `assets`/`users` objects, because it no
 * longer selects from `scans` directly -- the RPC does the joining, after
 * paging, so the browser is never sent rows it will not display.
 */
interface ScanRow {
  id: string
  asset_id: string
  asset_name: string | null
  asset_serial: string | null
  scan_type: string | null
  location_name: string | null
  scanned_at: string
  scanned_by_name: string | null
  matches: Array<{ source_type: string; source_id: string; matched_field: string }>
  total_count: number
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
  const router = useRouter()
  const searchParams = useSearchParams()

  // Search, filters and paging are seeded from the URL (spec section 25), so a
  // refresh keeps the view, back/forward behave, and a colleague can be sent a
  // link to what you are looking at.
  const [scans, setScans] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [range, setRange] = useState<RangeFilter>(
    (['7d', '30d', 'all'] as const).includes(searchParams.get('range') as RangeFilter)
      ? (searchParams.get('range') as RangeFilter)
      : '30d'
  )
  const [type, setType] = useState<TypeFilter>(
    (['all', 'check', 'inventory', 'checkout', 'return'] as const).includes(
      searchParams.get('type') as TypeFilter
    )
      ? (searchParams.get('type') as TypeFilter)
      : 'all'
  )

  // The search now hits the server, so it is debounced with the shared hook
  // rather than a copy of the same setTimeout.
  const debouncedSearch = useDebounce(search)

  const hasMore = scans.length < totalCount

  /**
   * Build the RPC parameters from the current UI state.
   *
   * The scan-type resolution happens here, on the client, because the client
   * owns the locale dictionary: a typed "sortie" becomes the enum `checkout`,
   * and the RPC filters on the enum, never on a label. A term that resolves to
   * no type stays a text term rather than being dropped.
   *
   * A type chosen from the filter chips wins over one inferred from the query:
   * an explicit click is a stronger signal than a guess at what a word meant.
   */
  const buildParams = useCallback(() => {
    const resolved = resolveScanTypes(debouncedSearch)

    const scanTypes =
      type !== 'all' ? [type] : resolved.types.length > 0 ? resolved.types : null

    let since: string | null = null
    if (range !== 'all') {
      const d = new Date()
      d.setDate(d.getDate() - (range === '7d' ? 7 : 30))
      since = d.toISOString()
    }

    return {
      p_query: resolved.textTerms.length > 0 ? resolved.textTerms.join(' ') : null,
      p_scan_types: scanTypes,
      p_since: since,
    }
  }, [debouncedSearch, range, type])

  const load = useCallback(
    async (offset: number, replace: boolean) => {
      const supabase = createClient()
      const params = buildParams()

      // One call. The server searches the WHOLE authorized dataset, filters,
      // sorts, counts and slices -- the browser receives one page of rows that
      // are already joined and already carry their provenance. Replaces a
      // client-side filter over the 50 rows that happened to be loaded.
      const { data, error: rpcError } = await supabase.rpc('search_scans', {
        ...params,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      })

      if (rpcError) {
        // An expired session reads as a permission failure here, because the
        // function is granted to authenticated only.
        if (rpcError.code === '42501') {
          router.push('/login')
          return
        }
        console.error('Scan search failed:', rpcError)
        // Surface it. A failed search must never render as "no results", or
        // the user concludes the scan does not exist.
        setError(true)
        if (replace) {
          setScans([])
          setTotalCount(0)
        }
        return
      }

      setError(false)
      const rows = (data || []) as ScanRow[]
      // total_count is a window function over the whole match set, repeated on
      // every row. An empty page legitimately means zero matches (spec 21) --
      // never rows.length, which is the page size.
      setTotalCount(rows.length > 0 ? Number(rows[0].total_count) : 0)
      setScans((prev) => (replace ? rows : [...prev, ...rows]))
    },
    [buildParams, router]
  )

  useEffect(() => {
    setLoading(true)
    load(0, true).finally(() => setLoading(false))
  }, [load])

  // Mirror search, filters and range into the URL. replace() rather than
  // push() so typing does not fill the history with one entry per keystroke.
  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim())
    if (range !== '30d') params.set('range', range)
    if (type !== 'all') params.set('type', type)
    const qs = params.toString()
    router.replace(qs ? `/scans?${qs}` : '/scans', { scroll: false })
  }, [debouncedSearch, range, type, router])

  async function loadMore() {
    setLoadingMore(true)
    await load(scans.length, false)
    setLoadingMore(false)
  }

  // No client-side filtering. `scans` IS the server's answer for the current
  // query -- the page renders what came back, nothing more.

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

  // The RPC already returns the scanning user as one trimmed string, and
  // searches it, so there is nothing left to assemble here.

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
      ) : error ? (
        /* A failed search is NOT "no results". Conflating the two is what
           makes someone conclude a scan does not exist and act on it. */
        <div className="text-center py-16">
          <div
            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: '#fdf1e7' }}
          >
            <AlertTriangle className="w-8 h-8" style={{ color: '#8a4b03' }} />
          </div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
            {t('scans.searchFailedTitle')}
          </h3>
          <p className="text-[15px] max-w-md mx-auto mb-4" style={{ color: 'var(--text-muted, #777)' }}>
            {t('scans.searchFailedBody')}
          </p>
          <button
            onClick={() => { setLoading(true); load(0, true).finally(() => setLoading(false)) }}
            className="px-4 py-2.5 rounded-md text-[14px] font-medium"
            style={{ backgroundColor: 'var(--accent-fill, #a84605)', color: '#fff' }}
          >
            {t('scans.retry')}
          </button>
        </div>
      ) : scans.length === 0 && (debouncedSearch.trim() || type !== 'all') ? (
        /* Searched or filtered, genuinely nothing matched -- across the whole
           dataset now, not merely the loaded page. */
        <p className="text-[14px] py-12 text-center" style={{ color: 'var(--text-muted, #777)' }}>
          {t('scans.noResults')}
        </p>
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
      ) : (
        <>
          {/* The real total for this query, not the number of loaded rows
              (spec 20/21). "50 of 327" is the honest statement; "50 results"
              when 327 match is the bug this replaces. */}
          <p className="text-[12px] mb-2" style={{ color: 'var(--text-hint, #888)' }}>
            {scans.length < totalCount
              ? `${scans.length} ${t('scans.ofTotal')} ${totalCount} ${t('scans.totalScans')}`
              : `${totalCount} ${t('scans.totalScans')}`}
          </p>

          <div className="space-y-1.5 animate-enter" key={`${range}-${type}`}>
            {scans.map((s) => {
              const style = TYPE_STYLES[s.scan_type || ''] || TYPE_STYLES.check
              const Icon = style.icon
              const who = s.scanned_by_name

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
                      {s.asset_name || '-'}
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

          {/* No `&& !search` any more. Hiding this during a search was the
              worst part of the old behaviour: it searched 50 loaded rows and
              then removed the only way to reach the rest. Paging is now over
              the full match set, so it applies to searches too. */}
          {hasMore && (
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
