'use client'

// app/(admin)/admin/AdminOverviewView.tsx
// Client island for /admin. Renders rows the server already computed; it
// performs no queries and no writes of its own.
//
// It is a client component only because translation runs through
// useLanguage() + createTranslator(), which are client-side, while the page is
// a force-dynamic server component. Same split as AdminOrgDetailView.
//
// Primitives come from ./adminPrimitives so this page and the organisation
// detail page cannot drift into two dialects of the same design.
//
// HONESTY RULES THIS FILE ENFORCES
//
// A read that FAILED renders a failure line, never a zero. A clean check names
// what it looked at. A metric with no source is absent entirely rather than
// rendered as zero or a dash: there is no revenue panel here, and no heading
// where one would go.

import Link from 'next/link'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import { monthlyPrice, formatEuros } from '@/lib/billing/capacity-price'
import {
  Card,
  PanelHeading,
  FailedLine,
  CleanLine,
  StatCard,
  StatusChip,
  formatCount,
  dayTime,
  type Tone,
} from './adminPrimitives'
import type {
  StripResult,
  CatalogueResult,
  DeliveriesResult,
  WatchResult,
  WatchCondition,
  BillingOverviewResult,
  AdminActionsResult,
} from '@/lib/admin/overview'

export interface EvidenceSummary {
  d1: { rows: number; failed: boolean }
  d2: { rows: number; failed: boolean }
  d3: { rows: number; failed: boolean }
  anyFailed: boolean
  error: string | null
}

interface Props {
  strip: StripResult
  evidence: EvidenceSummary
  catalogue: CatalogueResult
  deliveries: DeliveriesResult
  watch: WatchResult
  billing: BillingOverviewResult
  actions: AdminActionsResult
}

const TH =
  'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-hint,#6a6a6a)]'
const TD = 'px-3 py-2 text-[12px] text-[var(--text-secondary,#444444)]'

export default function AdminOverviewView({
  strip,
  evidence,
  catalogue,
  deliveries,
  watch,
  billing,
  actions,
}: Props) {
  const { language } = useLanguage()
  const t = createTranslator(language)

  const statLabels: Record<string, string> = {
    organizations: t('adminOverview.statOrganizations'),
    activePilots: t('adminOverview.statActivePilots'),
    paying: t('adminOverview.statPaying'),
    assets: t('adminOverview.statAssets'),
    activeRentals: t('adminOverview.statActiveRentals'),
    inspections: t('adminOverview.statInspections'),
  }

  const conditionLabels: Record<WatchCondition, string> = {
    over_capacity: t('adminOverview.condOverCapacity'),
    pilot_ending: t('adminOverview.condPilotEnding'),
    locked_with_assets: t('adminOverview.condLockedWithAssets'),
    no_recent_signin: t('adminOverview.condNoRecentSignin'),
    evidence_below_floor: t('adminOverview.condEvidenceBelowFloor'),
  }

  const conditionTone: Record<WatchCondition, Tone> = {
    over_capacity: 'retard',
    pilot_ending: 'bientot',
    locked_with_assets: 'retard',
    no_recent_signin: 'bientot',
    evidence_below_floor: 'bientot',
  }

  const accessTone = (a: string): Tone =>
    a === 'full' ? 'conforme' : a === 'read_only' ? 'bientot' : 'retard'

  const delta = (current: number | null, prior: number | null) =>
    current === null || prior === null ? (
      <span className="text-[var(--text-hint,#6a6a6a)]">
        {t('adminOverview.deltaUnavailable')}
      </span>
    ) : (
      <span className="tabular-nums">
        {t('adminOverview.deltaNew')} {current} / {t('adminOverview.deltaPrior')} {prior}
      </span>
    )

  const evidenceRows = [
    { key: 'd1', label: t('adminOverview.evidenceD1'), ...evidence.d1 },
    { key: 'd2', label: t('adminOverview.evidenceD2'), ...evidence.d2 },
    { key: 'd3', label: t('adminOverview.evidenceD3'), ...evidence.d3 },
  ]
  const evidenceTotal = evidence.d1.rows + evidence.d2.rows + evidence.d3.rows

  return (
    <div className="min-h-screen bg-[var(--page-bg,#f6f8fd)] px-6 py-5">
      <div className="mb-5">
        <h1 className="text-[20px] font-medium leading-tight text-[var(--text-primary,#1a1a1a)]">
          {t('adminOverview.pageTitle')}
        </h1>
        <p className="mt-0.5 text-[11px] text-[var(--text-hint,#6a6a6a)]">
          {t('adminOverview.pageSubtitle')}
        </p>
      </div>

      {/* ===================== Top strip ===================== */}
      {strip.failed ? (
        <Card className="mb-3">
          <FailedLine text={t('adminOverview.readFailed')} error={strip.error} />
        </Card>
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {strip.stats.map((s) => (
            <StatCard
              key={s.key}
              label={statLabels[s.key] ?? s.key}
              value={formatCount(s.value, language)}
              sub={delta(s.current, s.prior)}
            />
          ))}
          {/* The only red card on the page. If everything is red, nothing is. */}
          <StatCard
            tone={watch.rows.length > 0 ? 'retard' : 'neutral'}
            label={t('adminOverview.statAttention')}
            value={String(watch.rows.length)}
            sub={t('adminOverview.statAttentionSub')}
          />
        </div>
      )}

      {/* ===================== Row 1 ===================== */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 1. Evidence health */}
        <Card>
          <PanelHeading
            title={t('adminOverview.evidenceTitle')}
            note={t('adminOverview.evidenceSubtitle')}
            href="/admin/evidence"
            linkLabel={t('adminOverview.evidenceOpen')}
          />
          {evidence.anyFailed ? (
            <FailedLine
              text={t('adminOverview.evidenceDetectorFailed')}
              error={evidence.error}
            />
          ) : evidenceTotal === 0 ? (
            <CleanLine text={t('adminOverview.evidenceClean')} />
          ) : (
            <ul className="divide-y divide-[#dcdee3]">
              {evidenceRows.map((d) => (
                <li key={d.key}>
                  <Link
                    href="/admin/evidence"
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[rgba(0,0,0,0.02)]"
                  >
                    <span className="text-[12px] text-[var(--text-primary,#1a1a1a)]">
                      {d.label}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className={`text-[14px] font-semibold tabular-nums ${
                          d.rows > 0
                            ? 'text-[var(--status-retard-ink,#991b1b)]'
                            : 'text-[var(--status-conforme-ink,#036143)]'
                        }`}
                      >
                        {d.rows}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted,#5f5f5f)]">
                        {t('adminOverview.evidenceRows')}
                      </span>
                      <span aria-hidden className="text-[var(--text-hint,#6a6a6a)]">
                        &rsaquo;
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 2. Regulatory catalogue */}
        <Card>
          <PanelHeading
            title={t('adminOverview.catalogueTitle')}
            href="/admin/catalogue"
            linkLabel={t('adminOverview.catalogueOpen')}
          />
          {catalogue.failed ? (
            <FailedLine text={t('adminOverview.readFailed')} error={catalogue.error} />
          ) : (
            <div className="px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[22px] font-semibold leading-tight text-[var(--text-primary,#1a1a1a)]">
                  {catalogue.total}
                </span>
                <span className="text-[12px] text-[var(--text-secondary,#444444)]">
                  {t('adminOverview.catalogueTotal')}
                </span>
              </div>
              <dl className="mt-3 space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12px] text-[var(--text-secondary,#444444)]">
                    {t('adminOverview.catalogueSourced')}
                  </dt>
                  <dd className="text-[13px] font-semibold tabular-nums text-[var(--status-conforme-ink,#036143)]">
                    {catalogue.sourced}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12px] text-[var(--text-secondary,#444444)]">
                    {t('adminOverview.catalogueToConfirm')}
                  </dt>
                  <dd className="text-[13px] font-semibold tabular-nums text-[var(--status-bientot-ink,#8a4b03)]">
                    {catalogue.toConfirm}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12px] text-[var(--text-secondary,#444444)]">
                    {t('adminOverview.catalogueManual')}
                  </dt>
                  <dd className="text-[13px] font-semibold tabular-nums text-[var(--text-primary,#1a1a1a)]">
                    {catalogue.manual}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </Card>

        {/* 3. Deliveries */}
        <Card>
          <PanelHeading
            title={t('adminOverview.deliveriesTitle')}
            href="/admin/deliveries"
            linkLabel={t('adminOverview.deliveriesOpen')}
          />
          {deliveries.failed ? (
            <FailedLine text={t('adminOverview.readFailed')} error={deliveries.error} />
          ) : (
            <div className="px-4 py-3">
              <dl className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12px] text-[var(--text-secondary,#444444)]">
                    {t('adminOverview.deliveriesSentToday')}
                  </dt>
                  <dd className="text-[16px] font-semibold tabular-nums text-[var(--text-primary,#1a1a1a)]">
                    {deliveries.alertsSentToday}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12px] text-[var(--text-secondary,#444444)]">
                    {t('adminOverview.deliveriesSentTotal')}
                  </dt>
                  <dd className="text-[13px] tabular-nums text-[var(--text-primary,#1a1a1a)]">
                    {formatCount(deliveries.alertsSentTotal, language)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12px] text-[var(--text-secondary,#444444)]">
                    {t('adminOverview.deliveriesQueued')}
                  </dt>
                  <dd
                    className={`text-[13px] font-semibold tabular-nums ${
                      deliveries.alertsQueued > 0
                        ? 'text-[var(--status-bientot-ink,#8a4b03)]'
                        : 'text-[var(--status-conforme-ink,#036143)]'
                    }`}
                  >
                    {deliveries.alertsQueued}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 border-t border-[#dcdee3] pt-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-hint,#6a6a6a)]">
                  {t('adminOverview.deliveriesLastDigest')}
                </div>
                {deliveries.lastDigests.length === 0 ? (
                  <p className="mt-1 text-[11px] text-[var(--text-muted,#5f5f5f)]">
                    {t('adminOverview.deliveriesNoDigest')}
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1.5">
                    {deliveries.lastDigests.map((d) => (
                      <li key={d.providerMessageId ?? d.sentAt}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12px] text-[var(--text-primary,#1a1a1a)]">
                            {d.recipient}
                          </span>
                          <span className="shrink-0 tabular-nums text-[11px] text-[var(--text-muted,#5f5f5f)]">
                            {dayTime(d.sentAt)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-muted,#5f5f5f)]">
                          {d.itemCount} {t('adminOverview.deliveriesItems')} &middot; {d.period}
                          {d.providerMessageId ? (
                            <span className="ml-1 font-mono text-[10px] text-[var(--text-hint,#6a6a6a)]">
                              {d.providerMessageId.slice(0, 8)}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="mt-2 text-[10px] leading-snug text-[var(--text-hint,#6a6a6a)]">
                {t('adminOverview.deliveriesNoFailureColumn')}
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* ===================== Row 2 ===================== */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 4. Watchlist */}
        <Card className="lg:col-span-2">
          <PanelHeading
            title={t('adminOverview.watchTitle')}
            note={t('adminOverview.watchSubtitle')}
            href="/admin/orgs"
            linkLabel={t('adminOverview.watchOpenAll')}
          />
          {watch.failed ? (
            <FailedLine text={t('adminOverview.readFailed')} error={watch.error} />
          ) : watch.rows.length === 0 ? (
            <CleanLine text={t('adminOverview.watchClean')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-[#dcdee3]">
                    <th className={TH}>{t('adminOverview.watchColOrg')}</th>
                    <th className={TH}>{t('adminOverview.watchColCapacity')}</th>
                    <th className={TH}>{t('adminOverview.watchColEvidence')}</th>
                    <th className={TH}>{t('adminOverview.watchColCondition')}</th>
                    <th className={TH} aria-hidden />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dcdee3]">
                  {watch.rows.map((r) => (
                    <tr
                      key={r.organizationId}
                      className="cursor-pointer hover:bg-[rgba(0,0,0,0.02)]"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/orgs/${r.organizationId}`}
                          className="block"
                        >
                          <span className="text-[12px] font-medium text-[var(--text-primary,#1a1a1a)]">
                            {r.name}
                          </span>
                          <span className="ml-2">
                            <StatusChip tone={accessTone(r.access)}>{r.access}</StatusChip>
                          </span>
                        </Link>
                      </td>
                      <td className={`${TD} tabular-nums`}>
                        <Link href={`/admin/orgs/${r.organizationId}`} className="block">
                          {r.licensedCapacity == null
                            ? `${r.assets} / ${t('adminOverview.none')}`
                            : `${r.assets} / ${r.licensedCapacity}`}
                        </Link>
                      </td>
                      <td className={`${TD} tabular-nums`}>
                        <Link href={`/admin/orgs/${r.organizationId}`} className="block">
                          {r.evidencePct === null ? '-' : `${r.evidencePct}%`}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/orgs/${r.organizationId}`}
                          className="flex flex-wrap gap-1"
                        >
                          {r.conditions.map((c) => (
                            <StatusChip key={c} tone={conditionTone[c]}>
                              {conditionLabels[c]}
                            </StatusChip>
                          ))}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/admin/orgs/${r.organizationId}`}
                          aria-label={r.name}
                          className="text-[var(--text-hint,#6a6a6a)]"
                        >
                          &rsaquo;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 5. Billing */}
        <Card>
          <PanelHeading
            title={t('adminOverview.billingTitle')}
            note={t('adminOverview.billingSubtitle')}
          />
          {billing.failed ? (
            <FailedLine text={t('adminOverview.readFailed')} error={billing.error} />
          ) : billing.rows.length === 0 ? (
            <CleanLine text={t('adminOverview.billingNone')} />
          ) : (
            <div>
              <ul className="divide-y divide-[#dcdee3]">
                {billing.rows.map((r) => (
                  <li key={r.organizationId} className="px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link
                        href={`/admin/orgs/${r.organizationId}`}
                        className="truncate text-[12px] font-medium text-[var(--text-primary,#1a1a1a)] hover:underline"
                      >
                        {r.name}
                      </Link>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--text-primary,#1a1a1a)]">
                        {formatEuros(monthlyPrice(r.licensedCapacity), language)}
                        <span className="ml-1 text-[10px] font-normal text-[var(--text-muted,#5f5f5f)]">
                          {t('adminConsole.perMonth')}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="tabular-nums text-[11px] text-[var(--text-muted,#5f5f5f)]">
                        {t('adminOverview.billingColCapacity')} {r.licensedCapacity}
                      </span>
                      <StatusChip tone={r.stripeSubscriptionId ? 'conforme' : 'bientot'}>
                        {r.stripeSubscriptionId
                          ? t('adminOverview.billingStripeLinked')
                          : t('adminOverview.billingStripeNotLinked')}
                      </StatusChip>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="border-t border-[#dcdee3] px-4 py-2.5 text-[10px] leading-snug text-[var(--text-hint,#6a6a6a)]">
                {t('adminOverview.billingGridNote')}
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* ===================== Row 3: admin actions ===================== */}
      <div className="mt-3">
        <Card>
          <PanelHeading title={t('adminOverview.actionsTitle')} />
          {actions.failed ? (
            <FailedLine text={t('adminOverview.readFailed')} error={actions.error} />
          ) : actions.rows.length === 0 ? (
            <CleanLine text={t('adminOverview.actionsNone')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-[#dcdee3]">
                    <th className={TH}>{t('adminOverview.actionsColWhen')}</th>
                    <th className={TH}>{t('adminOverview.actionsColAction')}</th>
                    <th className={TH}>{t('adminOverview.actionsColChange')}</th>
                    <th className={TH}>{t('adminOverview.actionsColOrg')}</th>
                    <th className={TH}>{t('adminOverview.actionsColActor')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dcdee3]">
                  {actions.rows.map((a) => (
                    <tr key={a.id} className="hover:bg-[rgba(0,0,0,0.02)]">
                      <td className={`${TD} tabular-nums whitespace-nowrap`}>
                        {dayTime(a.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-medium text-[var(--text-primary,#1a1a1a)]">
                        {a.action}
                      </td>
                      <td className={TD}>{a.summary}</td>
                      <td className={TD}>
                        {a.targetOrgId ? (
                          <Link
                            href={`/admin/orgs/${a.targetOrgId}`}
                            className="text-[var(--accent-text,#b04a06)] hover:underline"
                          >
                            {a.targetOrgName ?? a.targetOrgId.slice(0, 8)}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className={TD}>{a.actorEmail ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
