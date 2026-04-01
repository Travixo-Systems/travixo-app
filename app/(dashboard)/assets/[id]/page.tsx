'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'qrcode'
import { ArrowLeft, ArrowDownToLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import { VGPStatusBadge } from '@/components/vgp/VGPStatusBadge'
import type { VGPStatus } from '@/components/vgp/VGPStatusBadge'
import EditAssetModal from '@/components/assets/EditAssetModal'
import AddVGPScheduleModal from '@/components/vgp/AddVGPScheduleModal'

// ============================================================================
// TYPES
// ============================================================================

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
  archived_at?: string | null
  asset_categories?: { id: string; name: string; color: string } | null
}

interface VGPSchedule {
  id: string
  interval_months: number
  last_inspection_date: string | null
  next_due_date: string
  status: string
  archived_at: string | null
}

interface Inspection {
  id: string
  inspection_date: string
  inspector_name: string
  inspector_company: string | null
  result: string
  certificate_url: string | null
  certificate_file_name: string | null
}

interface Rental {
  id: string
  client_name: string
  checkout_date: string
  expected_return_date: string | null
  actual_return_date: string | null
  status: string
}

// ============================================================================
// HELPERS
// ============================================================================

const STATUS_COLORS: Record<string, string> = {
  available: '#059669',
  in_use: '#444444',
  maintenance: '#d97706',
  retired: '#dc2626',
}

const STATUS_LABELS: Record<string, { fr: string; en: string }> = {
  available: { fr: 'Disponible', en: 'Available' },
  in_use: { fr: 'En utilisation', en: 'In Use' },
  maintenance: { fr: 'Maintenance', en: 'Maintenance' },
  retired: { fr: 'Retiré', en: 'Retired' },
}

const RESULT_COLORS: Record<string, string> = {
  passed: '#059669',
  conditional: '#d97706',
  failed: '#dc2626',
}

const VGP_BORDER_COLORS: Record<string, string> = {
  overdue: '#dc2626',
  upcoming: '#d97706',
  compliant: '#059669',
  unknown: '#6b7280',
}

function formatDate(iso: string | null, lang: string): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatCurrency(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr)
  due.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
}

function deriveVGPStatus(nextDueDate: string): VGPStatus {
  const days = daysUntil(nextDueDate)
  if (days < 0) return 'overdue'
  if (days <= 30) return 'upcoming'
  return 'compliant'
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AssetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const { language } = useLanguage()
  const t = createTranslator(language)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  const assetId = params.id as string

  const [asset, setAsset] = useState<Asset | null>(null)
  const [schedule, setSchedule] = useState<VGPSchedule | null>(null)
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [rentals, setRentals] = useState<Rental[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [showEdit, setShowEdit] = useState(false)
  const [showVGPSetup, setShowVGPSetup] = useState(false)

  // ---- Data loading ----
  useEffect(() => {
    loadAll()
  }, [assetId])

  async function loadAll() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()
      if (!userData?.organization_id) return

      // Fetch asset
      const { data: assetData } = await supabase
        .from('assets')
        .select(`
          *,
          asset_categories ( id, name, color )
        `)
        .eq('id', assetId)
        .eq('organization_id', userData.organization_id)
        .single()

      if (!assetData) { router.push('/assets'); return }
      setAsset(assetData as unknown as Asset)

      // Fetch most recent active VGP schedule
      const { data: schedules } = await supabase
        .from('vgp_schedules')
        .select('id, interval_months, last_inspection_date, next_due_date, status, archived_at')
        .eq('asset_id', assetId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)

      setSchedule((schedules && schedules.length > 0) ? schedules[0] as VGPSchedule : null)

      // Fetch inspection history
      const { data: inspData } = await supabase
        .from('vgp_inspections')
        .select('id, inspection_date, inspector_name, inspector_company, result, certificate_url, certificate_file_name')
        .eq('asset_id', assetId)
        .order('inspection_date', { ascending: false })

      setInspections((inspData || []) as Inspection[])

      // Fetch rental history
      const { data: rentalData } = await supabase
        .from('rentals')
        .select('id, client_name, checkout_date, expected_return_date, actual_return_date, status')
        .eq('asset_id', assetId)
        .order('checkout_date', { ascending: false })

      setRentals((rentalData || []) as Rental[])
    } catch (err) {
      console.error('Error loading asset detail:', err)
    } finally {
      setLoading(false)
    }
  }

  // ---- QR Code ----
  useEffect(() => {
    if (asset && qrCanvasRef.current) {
      const fullUrl = `${window.location.origin}/scan/${asset.qr_code}`
      QRCode.toCanvas(qrCanvasRef.current, fullUrl, {
        width: 56,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
      })
    }
  }, [asset])

  const downloadQR = () => {
    if (!qrCanvasRef.current || !asset) return
    // Generate higher-res version for download
    const offscreen = document.createElement('canvas')
    const fullUrl = `${window.location.origin}/scan/${asset.qr_code}`
    QRCode.toCanvas(offscreen, fullUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    }, () => {
      const url = offscreen.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `QR-${asset.name.replace(/\s+/g, '-')}.png`
      link.href = url
      link.click()
    })
  }

  // ---- Derived values ----
  const vgpStatus: VGPStatus = schedule ? deriveVGPStatus(schedule.next_due_date) : 'unknown'
  const vgpDays = schedule ? daysUntil(schedule.next_due_date) : 0

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#e8600a]" />
      </div>
    )
  }

  if (!asset) return null

  return (
    <div className="p-3 md:p-6 max-w-5xl mx-auto">
      {/* ---- HEADER ---- */}
      <Link
        href="/assets"
        className="inline-flex items-center gap-1.5 text-[14px] font-medium mb-4 transition-colors hover:underline"
        style={{ color: 'var(--accent, #e8600a)' }}
      >
        <ArrowLeft className="w-4 h-4" />
        {t('assetDetail.backToAssets')}
      </Link>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h1
            className="text-[18px] min-[1026px]:text-[22px] font-semibold truncate"
            style={{ color: 'var(--text-primary, #1a1a1a)' }}
          >
            {asset.name}
          </h1>
          {asset.serial_number && (
            <p
              className="text-[14px] font-mono mt-0.5"
              style={{ color: 'var(--text-muted, #777)' }}
            >
              {asset.serial_number}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            {asset.asset_categories?.name && (
              <span className="text-[14px]" style={{ color: 'var(--text-secondary, #444)' }}>
                {asset.asset_categories.name}
              </span>
            )}
            {asset.current_location && (
              <span className="text-[14px]" style={{ color: 'var(--text-secondary, #444)' }}>
                {asset.current_location}
              </span>
            )}
            <span
              className="text-[14px] font-medium"
              style={{ color: STATUS_COLORS[asset.status] || '#444' }}
            >
              {STATUS_LABELS[asset.status]?.[language === 'fr' ? 'fr' : 'en'] || asset.status}
            </span>
          </div>
        </div>

        {/* QR code */}
        <button
          onClick={downloadQR}
          className="flex-shrink-0 group relative cursor-pointer"
          title={t('assetDetail.downloadQr')}
        >
          <canvas
            ref={qrCanvasRef}
            className="rounded border"
            style={{ borderColor: '#dcdee3', width: 56, height: 56 }}
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowDownToLine className="w-5 h-5 text-white" />
          </span>
        </button>
      </div>

      {/* ---- SECTIONS ---- */}
      <div className="space-y-4">
        {/* SECTION 1 — Asset Details */}
        <section className="rounded-lg p-5" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>{t('assetDetail.details')}</SectionLabel>
            <button
              onClick={() => setShowEdit(true)}
              className="text-[13px] font-medium transition-colors hover:underline"
              style={{ color: 'var(--accent, #e8600a)' }}
            >
              {t('assetDetail.modify')}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t('assetDetail.status')}>
              <span style={{ color: STATUS_COLORS[asset.status] || '#444' }}>
                {STATUS_LABELS[asset.status]?.[language === 'fr' ? 'fr' : 'en'] || asset.status}
              </span>
            </Field>
            <Field label={t('assetDetail.purchaseDate')}>
              {formatDate(asset.purchase_date, language)}
            </Field>
            <Field label={t('assetDetail.purchasePrice')}>
              {formatCurrency(asset.purchase_price)}
            </Field>
            <Field label={t('assetDetail.currentValue')}>
              {formatCurrency(asset.current_value)}
            </Field>
            <div className="md:col-span-2">
              <Field label={t('assetDetail.description')}>
                <span style={{ color: asset.description ? undefined : 'var(--text-hint, #888)' }}>
                  {asset.description || t('assetDetail.noDescription')}
                </span>
              </Field>
            </div>
          </div>
        </section>

        {/* SECTION 2 — VGP Compliance */}
        <section
          className="rounded-lg p-5"
          style={{
            backgroundColor: 'var(--card-bg, #edeff2)',
            borderLeft: `3px solid ${VGP_BORDER_COLORS[vgpStatus]}`,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>{t('assetDetail.vgpCompliance')}</SectionLabel>
            {schedule && (
              <Link
                href={`/vgp/inspection/${schedule.id}`}
                className="text-[13px] font-medium transition-colors hover:underline"
                style={{ color: 'var(--accent, #e8600a)' }}
              >
                {t('assetDetail.newInspection')}
              </Link>
            )}
          </div>

          {schedule ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <VGPStatusBadge status={vgpStatus} size="lg" language={language === 'fr' ? 'fr' : 'en'} />
                <span
                  className="text-[14px] font-semibold tabular-nums"
                  style={{ color: vgpDays < 0 ? '#dc2626' : 'var(--text-secondary, #444)' }}
                >
                  {vgpDays < 0
                    ? `${Math.abs(vgpDays)} ${t('assetDetail.vgpDaysOverdue')}`
                    : `${vgpDays} ${t('assetDetail.vgpDaysRemaining')}`}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label={t('assetDetail.vgpInterval')}>
                  {schedule.interval_months} {t('assetDetail.vgpMonths')}
                </Field>
                <Field label={t('assetDetail.vgpLastInspection')}>
                  {formatDate(schedule.last_inspection_date, language)}
                </Field>
                <Field label={t('assetDetail.vgpNextDue')}>
                  {formatDate(schedule.next_due_date, language)}
                </Field>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-[14px] mb-3" style={{ color: 'var(--text-muted, #777)' }}>
                {t('assetDetail.vgpNone')}
              </p>
              <button
                onClick={() => setShowVGPSetup(true)}
                className="text-[14px] font-medium transition-colors hover:underline"
                style={{ color: 'var(--accent, #e8600a)' }}
              >
                {t('assetDetail.vgpConfigure')}
              </button>
            </div>
          )}
        </section>

        {/* SECTION 3 — Inspection History */}
        <section className="rounded-lg p-5" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>{t('assetDetail.inspectionHistory')}</SectionLabel>
            {schedule && (
              <Link
                href={`/vgp/inspection/${schedule.id}`}
                className="text-[13px] font-medium transition-colors hover:underline"
                style={{ color: 'var(--accent, #e8600a)' }}
              >
                {t('assetDetail.newInspection')}
              </Link>
            )}
          </div>

          {inspections.length === 0 ? (
            <p className="text-[14px] text-center py-6" style={{ color: 'var(--text-muted, #777)' }}>
              {t('assetDetail.noInspections')}
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden min-[1026px]:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <TH>{t('assetDetail.inspectionDate')}</TH>
                      <TH>{t('assetDetail.inspector')}</TH>
                      <TH>{t('assetDetail.company')}</TH>
                      <TH>{t('assetDetail.result')}</TH>
                      <TH>{t('assetDetail.certificate')}</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: '#dcdee3' }}>
                    {inspections.map((insp) => (
                      <tr key={insp.id} className="hover:bg-black/[0.02]">
                        <td className="px-3 py-2.5 text-[14px]" style={{ color: 'var(--text-secondary, #444)' }}>
                          {formatDate(insp.inspection_date, language)}
                        </td>
                        <td className="px-3 py-2.5 text-[14px]" style={{ color: 'var(--text-secondary, #444)' }}>
                          {insp.inspector_name}
                        </td>
                        <td className="px-3 py-2.5 text-[14px]" style={{ color: 'var(--text-secondary, #444)' }}>
                          {insp.inspector_company || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[14px] font-medium" style={{ color: RESULT_COLORS[insp.result] || '#444' }}>
                          {insp.result === 'passed' ? t('assetDetail.resultPassed')
                            : insp.result === 'conditional' ? t('assetDetail.resultConditional')
                            : insp.result === 'failed' ? t('assetDetail.resultFailed')
                            : insp.result}
                        </td>
                        <td className="px-3 py-2.5 text-[14px]">
                          {insp.certificate_url ? (
                            <a
                              href={insp.certificate_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium hover:underline"
                              style={{ color: 'var(--accent, #e8600a)' }}
                            >
                              PDF ↓
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-hint, #888)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card grid */}
              <div className="min-[1026px]:hidden grid grid-cols-1 sm:grid-cols-2 gap-2">
                {inspections.map((insp) => (
                  <div
                    key={insp.id}
                    className="rounded-lg p-3"
                    style={{ backgroundColor: 'var(--page-bg, #f6f8fd)' }}
                  >
                    <div className="flex items-center justify-between min-h-[44px]">
                      <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                        {formatDate(insp.inspection_date, language)}
                      </span>
                      <span
                        className="text-[14px] font-semibold"
                        style={{
                          color: insp.result === 'passed' ? '#059669'
                            : insp.result === 'conditional' ? '#d97706'
                            : insp.result === 'failed' ? '#dc2626'
                            : '#444',
                        }}
                      >
                        {insp.result === 'passed' ? t('assetDetail.resultPassed')
                          : insp.result === 'conditional' ? t('assetDetail.resultConditional')
                          : insp.result === 'failed' ? t('assetDetail.resultFailed')
                          : insp.result}
                      </span>
                    </div>
                    <p className="text-[12px]" style={{ color: 'var(--text-secondary, #444)' }}>
                      {insp.inspector_name}{insp.inspector_company ? ` — ${insp.inspector_company}` : ''}
                    </p>
                    <div className="mt-1">
                      {insp.certificate_url ? (
                        <a
                          href={insp.certificate_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center min-h-[44px] text-[12px] font-medium hover:underline"
                          style={{ color: 'var(--accent, #e8600a)' }}
                        >
                          PDF ↓
                        </a>
                      ) : (
                        <span className="text-[12px]" style={{ color: 'var(--text-hint, #888)' }}>—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* SECTION 4 — Rental History */}
        <section className="rounded-lg p-5" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
          <SectionLabel>{t('assetDetail.rentalHistory')}</SectionLabel>

          {rentals.length === 0 ? (
            <p className="text-[14px] text-center py-6 mt-4" style={{ color: 'var(--text-muted, #777)' }}>
              {t('assetDetail.noRentals')}
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden min-[1026px]:block overflow-x-auto mt-4">
                <table className="w-full">
                  <thead>
                    <tr>
                      <TH>{t('assetDetail.rentalClient')}</TH>
                      <TH>{t('assetDetail.rentalStart')}</TH>
                      <TH>{t('assetDetail.rentalEnd')}</TH>
                      <TH>{t('assetDetail.rentalStatus')}</TH>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: '#dcdee3' }}>
                    {rentals.map((rental) => {
                      const isActive = rental.status === 'active'
                      return (
                        <tr
                          key={rental.id}
                          className="hover:bg-black/[0.02]"
                          style={isActive ? { backgroundColor: 'rgba(5, 150, 105, 0.06)' } : undefined}
                        >
                          <td className="px-3 py-2.5 text-[14px] font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                            {rental.client_name}
                          </td>
                          <td className="px-3 py-2.5 text-[14px]" style={{ color: 'var(--text-secondary, #444)' }}>
                            {formatDate(rental.checkout_date, language)}
                          </td>
                          <td className="px-3 py-2.5 text-[14px]" style={{ color: 'var(--text-secondary, #444)' }}>
                            {formatDate(rental.actual_return_date || rental.expected_return_date, language)}
                          </td>
                          <td className="px-3 py-2.5 text-[14px] font-medium" style={{ color: isActive ? '#059669' : 'var(--text-secondary, #444)' }}>
                            {isActive ? t('assetDetail.rentalActive') : t('assetDetail.rentalReturned')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card grid */}
              <div className="min-[1026px]:hidden grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                {rentals.map((rental) => {
                  const isActive = rental.status === 'active'
                  return (
                    <div
                      key={rental.id}
                      className="rounded-lg p-3"
                      style={{
                        backgroundColor: isActive ? 'rgba(5, 150, 105, 0.06)' : 'var(--page-bg, #f6f8fd)',
                      }}
                    >
                      <div className="flex items-center justify-between min-h-[44px]">
                        <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                          {rental.client_name}
                        </span>
                        <span
                          className="text-[14px] font-semibold"
                          style={{ color: isActive ? '#059669' : 'var(--text-secondary, #444)' }}
                        >
                          {isActive ? t('assetDetail.rentalActive') : t('assetDetail.rentalReturned')}
                        </span>
                      </div>
                      <p className="text-[12px]" style={{ color: 'var(--text-secondary, #444)' }}>
                        {formatDate(rental.checkout_date, language)} → {formatDate(rental.actual_return_date || rental.expected_return_date, language)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ---- MODALS ---- */}
      {showEdit && (
        <EditAssetModal
          isOpen={showEdit}
          onClose={() => { setShowEdit(false); loadAll() }}
          asset={asset}
        />
      )}

      {showVGPSetup && (
        <AddVGPScheduleModal
          asset={{
            id: asset.id,
            name: asset.name,
            serial_number: asset.serial_number ?? undefined,
            category: asset.asset_categories?.name || 'Unknown',
          }}
          onClose={() => setShowVGPSetup(false)}
          onSuccess={() => { setShowVGPSetup(false); loadAll() }}
        />
      )}
    </div>
  )
}

// ============================================================================
// SHARED SUB-COMPONENTS
// ============================================================================

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[12px] font-semibold uppercase tracking-[0.5px]"
      style={{ color: 'var(--text-hint, #888)' }}
    >
      {children}
    </h2>
  )
}

function TH({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.5px]"
      style={{ color: 'var(--text-hint, #888)' }}
    >
      {children}
    </th>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-medium mb-0.5" style={{ color: 'var(--text-hint, #888)' }}>
        {label}
      </p>
      <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
        {children}
      </p>
    </div>
  )
}
