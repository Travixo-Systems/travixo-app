'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Send, AlertTriangle, ShieldAlert } from 'lucide-react'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import FeatureGate from '@/components/subscription/FeatureGate'
import StatusBadge from '@/components/ui/StatusBadge'
import toast from 'react-hot-toast'

interface Client {
  id: string
  name: string
  email: string | null
}

interface ClientRental {
  id: string
  asset_id: string
  asset_name: string | null
  serial_number: string | null
  checkout_date: string
  expected_return_date: string | null
  actual_return_date: string | null
  status: string
  vgp_due_date: string | null
  last_recall_at: string | null
}

type Filter = 'all' | 'out' | 'returned' | 'vgp'

function daysUntil(d: string | null): number | null {
  if (!d) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  return Math.floor((target.getTime() - today.getTime()) / 86_400_000)
}

export default function EquipmentPageClient() {
  const params = useParams()
  const searchParams = useSearchParams()
  const clientId = params.id as string
  const { language } = useLanguage()
  const t = createTranslator(language)

  const filterParam = searchParams.get('filter')
  const initialFilter: Filter =
    filterParam === 'all' || filterParam === 'out' || filterParam === 'returned' || filterParam === 'vgp'
      ? filterParam
      : 'out'

  const [client, setClient] = useState<Client | null>(null)
  const [rentals, setRentals] = useState<ClientRental[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}`)
      if (!res.ok) {
        setNotFound(true)
        return
      }
      const data = await res.json()
      setClient(data.client)
      setRentals([...(data.active_rentals || []), ...(data.past_rentals || [])])
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const visible = useMemo(() => {
    switch (filter) {
      case 'out':
        return rentals.filter((r) => r.status === 'active')
      case 'returned':
        return rentals.filter((r) => r.status !== 'active')
      case 'vgp': {
        return rentals.filter((r) => {
          if (r.status !== 'active') return false
          const d = daysUntil(r.vgp_due_date)
          return d !== null && d <= 30
        })
      }
      default:
        return rentals
    }
  }, [rentals, filter])

  // Only active rentals with a VGP schedule can be recalled.
  const recallable = useMemo(
    () => visible.filter((r) => r.status === 'active' && r.vgp_due_date),
    [visible]
  )

  // Drop selections that the current filter hides, so the button count always
  // matches what the user can see.
  useEffect(() => {
    setSelected((prev) => {
      const allowed = new Set(recallable.map((r) => r.id))
      const next = new Set([...prev].filter((id) => allowed.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [recallable])

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === recallable.length ? new Set() : new Set(recallable.map((r) => r.id))
    )
  }

  /**
   * Recall one rental, or every currently-selected rental as one grouped email.
   *
   * Applied optimistically: the "last recall" date updates the moment the
   * button is pressed, and rolls back if the send fails. This is the action a
   * depot manager repeats most, and waiting on a round-trip before showing any
   * change made every press feel slow.
   */
  async function sendRecall(ids: string[]) {
    if (ids.length === 0 || sending) return
    setSending(true)

    const previous = rentals
    const now = new Date().toISOString()
    const target = new Set(ids)
    setRentals((prev) =>
      prev.map((r) => (target.has(r.id) ? { ...r, last_recall_at: now } : r))
    )

    try {
      const payload = ids
        .map((id) => previous.find((r) => r.id === id))
        .filter((r): r is ClientRental => !!r?.vgp_due_date)
        .map((r) => ({ rental_id: r.id, next_due_date: r.vgp_due_date as string }))

      const res = await fetch('/api/vgp/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.length === 1 ? payload[0] : { rentals: payload }),
      })
      const data = await res.json()

      if (!res.ok) {
        setRentals(previous)
        toast.error(
          data.error === 'client_email_missing'
            ? t('clients.noEmailWarning')
            : t('vgpRentalContext.recallFailed')
        )
        return
      }

      toast.success(`${t('clients.recallSentTo')} ${data.sent_to}`)
      setSelected(new Set())
      fetchData()
    } catch {
      setRentals(previous)
      toast.error(t('vgpRentalContext.recallFailed'))
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (notFound || !client) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 text-[14px] font-medium mb-6"
          style={{ color: 'var(--accent-text, #b04a06)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          {t('clients.backToClients')}
        </Link>
        <p className="text-[15px]" style={{ color: 'var(--text-muted, #777)' }}>
          {t('clients.clientNotFound')}
        </p>
      </div>
    )
  }

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'out', label: t('clients.filterOut'), count: rentals.filter((r) => r.status === 'active').length },
    {
      key: 'vgp',
      label: t('clients.filterVgpRisk'),
      count: rentals.filter((r) => {
        if (r.status !== 'active') return false
        const d = daysUntil(r.vgp_due_date)
        return d !== null && d <= 30
      }).length,
    },
    { key: 'returned', label: t('clients.filterReturned'), count: rentals.filter((r) => r.status !== 'active').length },
    { key: 'all', label: t('clients.filterAll'), count: rentals.length },
  ]

  return (
    <FeatureGate feature="rental_management">
      <div className="p-3 md:p-6 max-w-5xl mx-auto pb-28">
        <Link
          href={`/clients/${clientId}`}
          className="inline-flex items-center gap-2 text-[14px] font-medium mb-5 hover:underline"
          style={{ color: 'var(--accent-text, #b04a06)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          {t('clients.backToClient')}
        </Link>

        <div className="mb-5">
          <h1
            className="text-[20px] lg:text-[24px] font-semibold"
            style={{ color: 'var(--text-primary, #1a1a1a)' }}
          >
            {t('clients.equipmentPageTitle')}
          </h1>
          <p className="text-[14px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
            {client.name}
          </p>
        </div>

        {!client.email && (
          <div
            className="flex items-start gap-2.5 rounded-lg p-3.5 mb-5"
            style={{ backgroundColor: 'rgba(217,119,6,0.08)', borderLeft: '3px solid #d97706' }}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#d97706' }} />
            <p className="text-[13px]" style={{ color: 'var(--text-secondary, #444)' }}>
              {t('clients.noEmailWarning')}
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors"
              style={
                filter === f.key
                  ? { backgroundColor: 'var(--accent-fill, #a84605)', color: '#fff' }
                  : { backgroundColor: 'var(--card-bg, #edeff2)', color: 'var(--text-secondary, #444)' }
              }
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {/* Select all */}
        {recallable.length > 0 && client.email && (
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={toggleAll}
              className="text-[13px] font-medium hover:underline"
              style={{ color: 'var(--accent-text, #b04a06)' }}
            >
              {selected.size === recallable.length ? t('clients.clearSelection') : t('clients.selectAll')}
            </button>
            <span className="text-[12px]" style={{ color: 'var(--text-hint, #888)' }}>
              {t('clients.recallGroupedNote')}
            </span>
          </div>
        )}

        {/* Rows */}
        {visible.length === 0 ? (
          <p className="text-[14px] py-8 text-center" style={{ color: 'var(--text-muted, #777)' }}>
            {t('clients.noEquipment')}
          </p>
        ) : (
          <div className="space-y-2 animate-enter" key={filter}>
            {visible.map((r) => {
              const vgpDays = daysUntil(r.vgp_due_date)
              const vgpAtRisk = r.status === 'active' && vgpDays !== null && vgpDays <= 30
              const canRecall = r.status === 'active' && !!r.vgp_due_date && !!client.email
              const isSelected = selected.has(r.id)

              return (
                <div
                  key={r.id}
                  className="rounded-lg p-4 transition-colors"
                  style={{
                    backgroundColor: 'var(--card-bg, #edeff2)',
                    outline: isSelected ? '2px solid var(--accent, #e8600a)' : 'none',
                  }}
                >
                  <div className="flex items-start gap-3">
                    {canRecall && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(r.id)}
                        aria-label={r.asset_name || undefined}
                        className="mt-1 w-4 h-4 flex-shrink-0 accent-[#e8600a] cursor-pointer"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/assets/${r.asset_id}`}
                        className="text-[15px] font-medium hover:underline"
                        style={{ color: 'var(--text-primary, #1a1a1a)' }}
                      >
                        {r.asset_name || t('clients.viewAsset')}
                      </Link>
                      {r.serial_number && (
                        <span className="text-[12px] ml-2" style={{ color: 'var(--text-hint, #888)' }}>
                          {r.serial_number}
                        </span>
                      )}

                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                        <span className="text-[12px]" style={{ color: 'var(--text-muted, #777)' }}>
                          {t('clients.checkedOut')} {formatDate(r.checkout_date)}
                        </span>
                        {r.status !== 'active' ? (
                          <span className="text-[12px]" style={{ color: 'var(--text-muted, #777)' }}>
                            {t('clients.returnedOn')} {formatDate(r.actual_return_date)}
                          </span>
                        ) : (
                          r.expected_return_date && (
                            <span className="text-[12px]" style={{ color: 'var(--text-muted, #777)' }}>
                              {t('clients.dueBack')} {formatDate(r.expected_return_date)}
                            </span>
                          )
                        )}
                        <span
                          className="text-[12px]"
                          style={{ color: r.last_recall_at ? 'var(--text-muted, #777)' : 'var(--text-hint, #888)' }}
                        >
                          {r.last_recall_at
                            ? `${t('clients.lastRecall')} ${formatDate(r.last_recall_at)}`
                            : r.status === 'active'
                              ? t('clients.neverRecalled')
                              : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {vgpAtRisk && (
                        <StatusBadge tone={vgpDays! < 0 ? 'retard' : 'bientot'}>
                          {vgpDays! < 0
                            ? t('clients.vgpOverdue')
                            : `${t('clients.vgpDue')} ${vgpDays}${language === 'fr' ? 'j' : 'd'}`}
                        </StatusBadge>
                      )}

                      {canRecall && (
                        <button
                          onClick={() => sendRecall([r.id])}
                          disabled={sending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
                          style={{
                            backgroundColor: 'var(--input-bg, #e3e5e9)',
                            color: 'var(--text-secondary, #444)',
                          }}
                        >
                          <Send className="w-3.5 h-3.5" />
                          {t('clients.recallSelected')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bulk action bar - only when a selection exists */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t" style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderColor: '#dcdee3' }}>
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-text, #b04a06)' }} />
              <span className="text-[13px] truncate" style={{ color: 'var(--text-secondary, #444)' }}>
                {selected.size} {t('clients.equipmentOut')}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setSelected(new Set())}
                className="px-3 py-2 text-[13px] font-medium rounded-md"
                style={{ color: 'var(--text-muted, #777)' }}
              >
                {t('clients.clearSelection')}
              </button>
              <button
                onClick={() => sendRecall([...selected])}
                disabled={sending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: 'var(--accent-fill, #a84605)' }}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t('clients.recallSelectedCount')} ({selected.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </FeatureGate>
  )
}
