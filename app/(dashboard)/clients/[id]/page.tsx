'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Package,
  AlertTriangle,
  Mail,
  Phone,
  Building2,
  Loader2,
  ShieldAlert,
  Send,
} from 'lucide-react'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import FeatureGate from '@/components/subscription/FeatureGate'
import StatusBadge from '@/components/ui/StatusBadge'
import toast from 'react-hot-toast'

interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  address: string | null
  notes: string | null
  created_at: string
}

interface ClientRental {
  id: string
  asset_id: string
  asset_name: string | null
  serial_number: string | null
  checkout_date: string
  expected_return_date: string | null
  actual_return_date: string | null
  return_condition: string | null
  status: string
  vgp_due_date: string | null
}

export default function ClientDetailPage() {
  const params = useParams()
  const clientId = params.id as string
  const { language } = useLanguage()
  const t = createTranslator(language)

  const [client, setClient] = useState<Client | null>(null)
  const [activeRentals, setActiveRentals] = useState<ClientRental[]>([])
  const [pastRentals, setPastRentals] = useState<ClientRental[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [recallingId, setRecallingId] = useState<string | null>(null)

  const fetchClient = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}`)
      if (!res.ok) {
        setNotFound(true)
        return
      }
      const data = await res.json()
      setClient(data.client)
      setActiveRentals(data.active_rentals || [])
      setPastRentals(data.past_rentals || [])
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetchClient()
  }, [fetchClient])

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const daysUntil = (d: string | null) => {
    if (!d) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(d)
    target.setHours(0, 0, 0, 0)
    return Math.floor((target.getTime() - today.getTime()) / 86_400_000)
  }

  async function handleRecall(rental: ClientRental) {
    if (!rental.vgp_due_date) return
    setRecallingId(rental.id)
    try {
      const res = await fetch('/api/vgp/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rental_id: rental.id,
          next_due_date: rental.vgp_due_date,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'client_email_missing') {
          toast.error(t('clients.noEmailWarning'))
          return
        }
        toast.error(t('vgpRentalContext.recallFailed'))
        return
      }

      toast.success(`${t('clients.recallSentTo')} ${data.sent_to}`)
    } catch {
      toast.error(t('vgpRentalContext.recallFailed'))
    } finally {
      setRecallingId(null)
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

  const overdueCount = activeRentals.filter((r) => {
    const d = daysUntil(r.expected_return_date)
    return d !== null && d < 0
  }).length

  const vgpRiskCount = activeRentals.filter((r) => {
    const d = daysUntil(r.vgp_due_date)
    return d !== null && d <= 30
  }).length

  return (
    <FeatureGate feature="rental_management">
      <div className="p-3 md:p-6 max-w-5xl mx-auto">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 text-[14px] font-medium mb-5 hover:underline"
          style={{ color: 'var(--accent-text, #b04a06)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          {t('clients.backToClients')}
        </Link>

        {/* Identity */}
        <div className="mb-6">
          <h1
            className="text-[20px] lg:text-[24px] font-semibold"
            style={{ color: 'var(--text-primary, #1a1a1a)' }}
          >
            {client.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            {client.company && (
              <span
                className="inline-flex items-center gap-1.5 text-[13px]"
                style={{ color: 'var(--text-muted, #777)' }}
              >
                <Building2 className="w-3.5 h-3.5" />
                {client.company}
              </span>
            )}
            {client.email && (
              <span
                className="inline-flex items-center gap-1.5 text-[13px]"
                style={{ color: 'var(--text-muted, #777)' }}
              >
                <Mail className="w-3.5 h-3.5" />
                {client.email}
              </span>
            )}
            {client.phone && (
              <span
                className="inline-flex items-center gap-1.5 text-[13px]"
                style={{ color: 'var(--text-muted, #777)' }}
              >
                <Phone className="w-3.5 h-3.5" />
                {client.phone}
              </span>
            )}
          </div>
        </div>

        {/* No-email warning: recall notices are undeliverable without it */}
        {!client.email && activeRentals.length > 0 && (
          <div
            className="flex items-start gap-2.5 rounded-lg p-3.5 mb-5"
            style={{ backgroundColor: 'rgba(217,119,6,0.08)', borderLeft: '3px solid #d97706' }}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#d97706' }} />
            <p className="text-[13px]" style={{ color: 'var(--text-secondary, #444)' }}>
              {t('clients.noEmailWarning')}{' '}
              <Link href="/clients" className="font-medium underline">
                {t('clients.addEmail')}
              </Link>
            </p>
          </div>
        )}

        {/* Summary tiles - each is a whole-tile link into the equipment list,
            pre-filtered, so there are no dead zones to click. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          <SummaryTile
            href={`/clients/${clientId}/equipment?filter=out`}
            label={t('clients.currentlyOut')}
            value={activeRentals.length}
            accent="var(--text-primary, #1a1a1a)"
          />
          <SummaryTile
            href={`/clients/${clientId}/equipment?filter=out`}
            label={t('clients.overdue')}
            value={overdueCount}
            accent={overdueCount > 0 ? '#dc2626' : 'var(--text-primary, #1a1a1a)'}
          />
          <SummaryTile
            href={`/clients/${clientId}/equipment?filter=all`}
            label={t('clients.totalRentals')}
            value={activeRentals.length + pastRentals.length}
            accent="var(--text-primary, #1a1a1a)"
          />
        </div>

        {/* VGP risk banner - the compliance signal that justifies this page */}
        {vgpRiskCount > 0 && (
          <div
            className="flex items-start gap-2.5 rounded-lg p-3.5 mb-6"
            style={{ backgroundColor: 'rgba(220,38,38,0.06)', borderLeft: '3px solid #dc2626' }}
          >
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#dc2626' }} />
            <div>
              <p
                className="text-[14px] font-semibold"
                style={{ color: 'var(--text-primary, #1a1a1a)' }}
              >
                {t('clients.recallNeeded')}
              </p>
              <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-secondary, #444)' }}>
                {t('clients.recallDescription')}
              </p>
            </div>
          </div>
        )}

        {/* Active rentals - summary only; the full, actionable list lives on
            the equipment page. */}
        <section className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2
              className="text-[13px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-hint, #888)' }}
            >
              {t('clients.currentlyOut')}
            </h2>
            <Link
              href={`/clients/${clientId}/equipment?filter=out`}
              className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
              style={{ color: 'var(--accent-text, #b04a06)' }}
            >
              {t('clients.viewAllEquipment')}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {activeRentals.length === 0 ? (
            <p className="text-[14px] py-4" style={{ color: 'var(--text-muted, #777)' }}>
              {t('clients.noActiveRentals')}
            </p>
          ) : (
            <div className="space-y-2">
              {activeRentals.slice(0, 5).map((rental) => {
                const returnDays = daysUntil(rental.expected_return_date)
                const vgpDays = daysUntil(rental.vgp_due_date)
                const isOverdue = returnDays !== null && returnDays < 0
                const vgpAtRisk = vgpDays !== null && vgpDays <= 30

                return (
                  <div
                    key={rental.id}
                    className="rounded-lg p-4"
                    style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/assets/${rental.asset_id}`}
                          className="text-[15px] font-medium hover:underline"
                          style={{ color: 'var(--text-primary, #1a1a1a)' }}
                        >
                          {rental.asset_name || t('clients.viewAsset')}
                        </Link>
                        {rental.serial_number && (
                          <span
                            className="text-[12px] ml-2"
                            style={{ color: 'var(--text-hint, #888)' }}
                          >
                            {rental.serial_number}
                          </span>
                        )}

                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                          <span
                            className="text-[12px]"
                            style={{ color: 'var(--text-muted, #777)' }}
                          >
                            {t('clients.checkedOut')} {formatDate(rental.checkout_date)}
                          </span>
                          {rental.expected_return_date && (
                            <span
                              className="text-[12px]"
                              style={{ color: isOverdue ? '#dc2626' : 'var(--text-muted, #777)' }}
                            >
                              {t('clients.dueBack')} {formatDate(rental.expected_return_date)}
                              {isOverdue && ` (${t('clients.overdue')})`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        {vgpAtRisk && (
                          <StatusBadge tone={vgpDays! < 0 ? 'retard' : 'bientot'}>
                            {vgpDays! < 0
                              ? t('clients.vgpOverdue')
                              : `${t('clients.vgpDue')} ${vgpDays}${language === 'fr' ? 'j' : 'd'}`}
                          </StatusBadge>
                        )}

                        {vgpAtRisk && client.email && (
                          <button
                            onClick={() => handleRecall(rental)}
                            disabled={recallingId === rental.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
                            style={{ backgroundColor: 'var(--accent-fill, #a84605)' }}
                          >
                            {recallingId === rental.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            {t('clients.sendRecall')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {activeRentals.length > 5 && (
                <Link
                  href={`/clients/${clientId}/equipment?filter=out`}
                  className="flex items-center justify-center gap-1 rounded-lg py-3 text-[13px] font-medium hover:bg-black/[0.04] transition-colors"
                  style={{ backgroundColor: 'var(--card-bg, #edeff2)', color: 'var(--accent-text, #b04a06)' }}
                >
                  {t('clients.viewAllEquipment')} ({activeRentals.length})
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
        </section>

        {/* History */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2
              className="text-[13px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-hint, #888)' }}
            >
              {t('clients.rentalHistory')}
            </h2>
            {pastRentals.length > 0 && (
              <Link
                href={`/clients/${clientId}/equipment?filter=returned`}
                className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
                style={{ color: 'var(--accent-text, #b04a06)' }}
              >
                {t('clients.viewAllEquipment')}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {pastRentals.length === 0 ? (
            <p className="text-[14px] py-4" style={{ color: 'var(--text-muted, #777)' }}>
              {t('clients.noRentalHistory')}
            </p>
          ) : (
            <div className="space-y-1.5">
              {pastRentals.slice(0, 5).map((rental) => (
                // Whole row links, not just the name - a partially-clickable
                // row produces dead clicks.
                <Link
                  key={rental.id}
                  href={`/assets/${rental.asset_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3 hover:bg-black/[0.04] transition-colors"
                  style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}
                >
                  <span
                    className="text-[14px] font-medium min-w-0"
                    style={{ color: 'var(--text-primary, #1a1a1a)' }}
                  >
                    {rental.asset_name || t('clients.viewAsset')}
                  </span>
                  <span className="text-[12px]" style={{ color: 'var(--text-muted, #777)' }}>
                    {formatDate(rental.checkout_date)}
                    {' → '}
                    {rental.actual_return_date
                      ? formatDate(rental.actual_return_date)
                      : '-'}
                  </span>
                </Link>
              ))}

              {pastRentals.length > 5 && (
                <Link
                  href={`/clients/${clientId}/equipment?filter=returned`}
                  className="flex items-center justify-center gap-1 rounded-lg py-3 text-[13px] font-medium hover:bg-black/[0.04] transition-colors"
                  style={{ backgroundColor: 'var(--card-bg, #edeff2)', color: 'var(--accent-text, #b04a06)' }}
                >
                  {t('clients.viewAllEquipment')} ({pastRentals.length})
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </FeatureGate>
  )
}

function SummaryTile({
  label,
  value,
  accent,
  href,
}: {
  label: string
  value: number
  accent: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg p-4 card-lift hover:bg-black/[0.04]"
      style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Package className="w-3.5 h-3.5" style={{ color: 'var(--text-hint, #888)' }} />
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-hint, #888)' }}
        >
          {label}
        </span>
      </div>
      <p className="text-[24px] font-semibold" style={{ color: accent }}>
        {value}
      </p>
    </Link>
  )
}
