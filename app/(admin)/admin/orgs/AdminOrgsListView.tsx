'use client'

// app/(admin)/admin/orgs/AdminOrgsListView.tsx
// Client island for /admin/orgs: the full organisations table.
//
// It is a client component for two reasons, not one: translation runs through
// useLanguage(), and the four filters are local state. The filters narrow an
// array the server already computed in full -- there are 19 organisations, so
// paging or refetching per filter would add latency and a loading state to
// solve a problem this dataset does not have. If it grows past a few hundred,
// this should become a server-side query with searchParams.
//
// Primitives come from ../adminPrimitives, so this page, the overview and the
// organisation detail page share one visual vocabulary.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import { Card, StatusChip, FailedLine, formatCount, day, type Tone } from '../adminPrimitives'

export interface OrgListRow {
  id: string
  name: string
  slug: string
  tier: string | null
  status: string | null
  isPilot: boolean
  access: 'full' | 'read_only' | 'locked'
  pilotEndDate: string | null
  users: number
  assets: number
  licensedCapacity: number | null
  createdAt: string
  /** Days since the most recent sign-in; null when never or unknown. */
  daysSinceSignIn: number | null
}

interface Props {
  rows: OrgListRow[]
  /** False when the Auth admin API could not be read. */
  signInKnown: boolean
  failed: boolean
  error: string | null
}

type HeadroomFilter = 'all' | 'over' | 'tight' | 'ok' | 'none'

const TH =
  'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-hint,#6a6a6a)]'
const TD = 'px-3 py-2 text-[12px] text-[var(--text-secondary,#444444)]'

/** Remaining capacity as a share, or null with no licence. */
function headroomOf(row: OrgListRow): number | null {
  if (row.licensedCapacity == null || row.licensedCapacity === 0) return null
  return (row.licensedCapacity - row.assets) / row.licensedCapacity
}

export default function AdminOrgsListView({ rows, signInKnown, failed, error }: Props) {
  const { language } = useLanguage()
  const t = createTranslator(language)

  const [status, setStatus] = useState<string>('all')
  const [pilot, setPilot] = useState<string>('all')
  const [access, setAccess] = useState<string>('all')
  const [headroom, setHeadroom] = useState<HeadroomFilter>('all')

  const statuses = useMemo(
    () => [...new Set(rows.map((r) => r.status).filter((s): s is string => !!s))].sort(),
    [rows]
  )

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false
      if (pilot === 'yes' && !r.isPilot) return false
      if (pilot === 'no' && r.isPilot) return false
      if (access !== 'all' && r.access !== access) return false

      if (headroom !== 'all') {
        const h = headroomOf(r)
        if (headroom === 'none' && h !== null) return false
        if (headroom === 'over' && !(h !== null && h < 0)) return false
        if (headroom === 'tight' && !(h !== null && h >= 0 && h < 0.1)) return false
        if (headroom === 'ok' && !(h !== null && h >= 0.1)) return false
      }
      return true
    })
  }, [rows, status, pilot, access, headroom])

  const accessTone = (a: string): Tone =>
    a === 'full' ? 'conforme' : a === 'read_only' ? 'bientot' : 'retard'

  const lastConnectedLabel = (days: number | null): string => {
    if (!signInKnown) return t('adminOrgsList.unknown')
    if (days === null) return t('adminOrgsList.never')
    if (days <= 0) return t('adminOrgsList.today')
    if (days === 1) return t('adminOrgsList.yesterday')
    return `${days}${t('adminOrgsList.daysAgo')}`
  }

  const selectClass =
    'rounded border border-[#dcdee3] bg-[var(--input-bg,#e3e5e9)] px-2 py-1 text-[12px] text-[var(--text-secondary,#444444)]'

  const anyFilter =
    status !== 'all' || pilot !== 'all' || access !== 'all' || headroom !== 'all'

  return (
    <div className="min-h-screen bg-[var(--page-bg,#f6f8fd)] px-6 py-5">
      <div className="mb-4">
        <Link
          href="/admin"
          className="text-[12px] text-[var(--accent-text,#b04a06)] hover:underline"
        >
          {t('adminOrgsList.backToOverview')}
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-medium leading-tight text-[var(--text-primary,#1a1a1a)]">
            {t('adminOrgsList.pageTitle')}
          </h1>
          <p className="mt-0.5 text-[11px] text-[var(--text-hint,#6a6a6a)]">
            {t('adminOrgsList.pageSubtitle')}
          </p>
        </div>
        <div className="text-[12px] tabular-nums text-[var(--text-muted,#5f5f5f)]">
          {filtered.length === rows.length
            ? `${rows.length} ${t('adminOrgsList.total')}`
            : `${filtered.length} ${t('adminOrgsList.showing')} / ${rows.length} ${t('adminOrgsList.total')}`}
        </div>
      </div>

      {/* ===================== Filters ===================== */}
      <Card className="mb-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-hint,#6a6a6a)]">
              {t('adminOrgsList.filterStatus')}
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClass}
            >
              <option value="all">{t('adminOrgsList.filterAll')}</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-hint,#6a6a6a)]">
              {t('adminOrgsList.filterPilot')}
            </span>
            <select
              value={pilot}
              onChange={(e) => setPilot(e.target.value)}
              className={selectClass}
            >
              <option value="all">{t('adminOrgsList.filterAll')}</option>
              <option value="yes">{t('adminOrgsList.filterPilotYes')}</option>
              <option value="no">{t('adminOrgsList.filterPilotNo')}</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-hint,#6a6a6a)]">
              {t('adminOrgsList.filterAccess')}
            </span>
            <select
              value={access}
              onChange={(e) => setAccess(e.target.value)}
              className={selectClass}
            >
              <option value="all">{t('adminOrgsList.filterAll')}</option>
              <option value="full">full</option>
              <option value="read_only">read_only</option>
              <option value="locked">locked</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-hint,#6a6a6a)]">
              {t('adminOrgsList.filterHeadroom')}
            </span>
            <select
              value={headroom}
              onChange={(e) => setHeadroom(e.target.value as HeadroomFilter)}
              className={selectClass}
            >
              <option value="all">{t('adminOrgsList.filterAll')}</option>
              <option value="over">{t('adminOrgsList.headroomOver')}</option>
              <option value="tight">{t('adminOrgsList.headroomTight')}</option>
              <option value="ok">{t('adminOrgsList.headroomOk')}</option>
              <option value="none">{t('adminOrgsList.headroomNone')}</option>
            </select>
          </label>

          {anyFilter && (
            <button
              type="button"
              onClick={() => {
                setStatus('all')
                setPilot('all')
                setAccess('all')
                setHeadroom('all')
              }}
              className="text-[11px] text-[var(--accent-text,#b04a06)] hover:underline"
            >
              {t('adminOrgsList.clearFilters')}
            </button>
          )}
        </div>
      </Card>

      {/* ===================== Table ===================== */}
      <Card>
        {failed ? (
          <FailedLine text={t('adminOrgsList.readFailed')} error={error} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-[#dcdee3]">
                  <th className={TH}>{t('adminOrgsList.colName')}</th>
                  <th className={TH}>{t('adminOrgsList.colSlug')}</th>
                  <th className={TH}>{t('adminOrgsList.colTier')}</th>
                  <th className={TH}>{t('adminOrgsList.colStatus')}</th>
                  <th className={TH}>{t('adminOrgsList.colPilot')}</th>
                  <th className={TH}>{t('adminOrgsList.colAccess')}</th>
                  <th className={TH}>{t('adminOrgsList.colLastConnected')}</th>
                  <th className={TH}>{t('adminOrgsList.colPilotEnds')}</th>
                  <th className={`${TH} text-right`}>{t('adminOrgsList.colUsers')}</th>
                  <th className={`${TH} text-right`}>{t('adminOrgsList.colAssets')}</th>
                  <th className={`${TH} text-right`}>{t('adminOrgsList.colCapacity')}</th>
                  <th className={TH}>{t('adminOrgsList.colCreated')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dcdee3]">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-3 py-8 text-center text-[12px] text-[var(--text-muted,#5f5f5f)]"
                    >
                      {t('adminOrgsList.emptyFiltered')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const h = headroomOf(r)
                    return (
                      <tr
                        key={r.id}
                        className="cursor-pointer hover:bg-[rgba(0,0,0,0.02)]"
                        onClick={() => {
                          window.location.href = `/admin/orgs/${r.id}`
                        }}
                      >
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/orgs/${r.id}`}
                            className="text-[12px] font-medium text-[var(--text-primary,#1a1a1a)] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.name}
                          </Link>
                        </td>
                        <td className={`${TD} font-mono text-[11px]`}>{r.slug}</td>
                        <td className={TD}>{r.tier ?? '-'}</td>
                        <td className={TD}>{r.status ?? '-'}</td>
                        <td className={TD}>
                          {r.isPilot ? t('adminOrgsList.yes') : t('adminOrgsList.no')}
                        </td>
                        <td className="px-3 py-2">
                          <StatusChip tone={accessTone(r.access)}>{r.access}</StatusChip>
                        </td>
                        <td className={TD}>{lastConnectedLabel(r.daysSinceSignIn)}</td>
                        <td className={`${TD} tabular-nums`}>{day(r.pilotEndDate)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{r.users}</td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {formatCount(r.assets, language)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {r.licensedCapacity == null ? (
                            <span className="text-[12px] text-[var(--text-hint,#6a6a6a)]">
                              -
                            </span>
                          ) : (
                            <span
                              className={`text-[12px] font-medium tabular-nums ${
                                h !== null && h < 0
                                  ? 'text-[var(--status-retard-ink,#991b1b)]'
                                  : h !== null && h < 0.1
                                    ? 'text-[var(--status-bientot-ink,#8a4b03)]'
                                    : 'text-[var(--text-secondary,#444444)]'
                              }`}
                            >
                              {r.assets} / {r.licensedCapacity}
                            </span>
                          )}
                        </td>
                        <td className={`${TD} tabular-nums`}>{day(r.createdAt)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
