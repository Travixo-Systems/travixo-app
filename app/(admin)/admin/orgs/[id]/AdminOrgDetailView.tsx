'use client'

// app/(admin)/admin/orgs/[id]/AdminOrgDetailView.tsx
// Client island for the organisation detail page. Renders rows the server
// already computed; it performs no queries and no writes of its own.
//
// It is a client component only because translation runs through
// useLanguage() + createTranslator(), which are client-side, while the page is
// a force-dynamic server component. Same split as AdminEvidenceView.
//
// VISUAL LANGUAGE
//
// Surfaces and type come from DESIGN_SPEC.md via the tokens already declared
// in app/globals.css: --page-bg, --card-bg, --text-primary/secondary/muted/
// hint, and the status triple. Colour carries compliance meaning only, never
// decoration, which is why category-style chips are absent and the only
// coloured text is a status.
//
// The accent is used through its role variants, never raw: #e8600a is 2.96:1
// on --card-bg and fails AA wherever it carries text, so --accent stays
// decorative (rails, borders) and --accent-text / --accent-fill carry type.
//
// HONESTY RULES THIS FILE ENFORCES
//
// A panel whose read FAILED renders a failure line, never a zero. A panel with
// no source is omitted with a stated reason rather than rendered empty. A
// clean exception panel names what was checked, because "no exceptions" is
// only reassuring when the reader can see the list.

import Link from 'next/link'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import { monthlyPrice, formatEuros } from '@/lib/billing/capacity-price'
import type {
  ChainResult,
  ChainLeg,
  UsageResult,
  BillingResult,
  AttentionResult,
  EventsResult,
} from '@/lib/admin/orgDetail'

export interface PilotScope {
  /** Null when the organization is not on a pilot at all. */
  applicable: boolean
  isPilot: boolean
  startDate: string | null
  endDate: string | null
  daysRemaining: number | null
  /** Pilot asset ceiling, a product constant rather than a per-org column. */
  includedCapacity: number
}

interface Props {
  orgName: string
  orgSlug: string
  accessLevel: 'full' | 'read_only' | 'locked'
  subscriptionStatus: string | null
  assetCount: number
  activeRentals: number
  inspections: number
  users: number
  chain: ChainResult
  usage: UsageResult
  billing: BillingResult
  pilot: PilotScope
  attention: AttentionResult
  events: EventsResult
  /** Rendered beneath the header: the existing write controls, untouched. */
  actions: React.ReactNode
}

function day(value: string | null): string {
  return value ? value.slice(0, 10) : '-'
}

function dayTime(value: string | null): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '-'
}

// --- primitives -------------------------------------------------------------

function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-lg border border-[#dcdee3] bg-[var(--card-bg,#edeef1)] ${className}`}
    >
      {children}
    </div>
  )
}

function PanelHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="border-b border-[#dcdee3] px-4 py-3">
      <h2 className="text-[13px] font-medium text-[var(--text-primary,#1a1a1a)]">
        {title}
      </h2>
      {note ? (
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-hint,#6a6a6a)]">
          {note}
        </p>
      ) : null}
    </div>
  )
}

/** A read that could not run is never rendered as zero. */
function FailedLine({ text, error }: { text: string; error: string | null }) {
  return (
    <div className="m-4 rounded border border-[#f0c4c4] bg-[#fdf3f3] px-3 py-2 text-[12px] text-[var(--status-retard-ink,#991b1b)]">
      <span className="font-medium">{text}</span>
      {error ? <span className="ml-2 font-mono text-[11px]">{error}</span> : null}
    </div>
  )
}

/** A panel with no live source says so instead of rendering an empty shell. */
function OmittedLine({ text }: { text: string }) {
  return (
    <p className="m-4 rounded border border-[#dcdee3] bg-[#e9ebee] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary,#444444)]">
      {text}
    </p>
  )
}

function StatusChip({
  tone,
  children,
}: {
  tone: 'conforme' | 'bientot' | 'retard' | 'neutral'
  children: React.ReactNode
}) {
  const map = {
    conforme: 'bg-[#dcf2e9] text-[var(--status-conforme-ink,#036143)]',
    bientot: 'bg-[#fbeeda] text-[var(--status-bientot-ink,#8a4b03)]',
    retard: 'bg-[#fbe0e0] text-[var(--status-retard-ink,#991b1b)]',
    neutral: 'bg-[#e3e5e9] text-[var(--text-secondary,#444444)]',
  } as const
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${map[tone]}`}
    >
      {children}
    </span>
  )
}

// --- stat cards -------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  bar,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  /** 0..1, or null for no bar. Over 1 renders as over-capacity. */
  bar?: number | null
}) {
  const over = bar != null && bar > 1
  const width = bar == null ? 0 : Math.min(100, Math.round(bar * 100))
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-hint,#6a6a6a)]">
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold leading-tight text-[var(--text-primary,#1a1a1a)]">
        {value}
      </div>
      {bar != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#dcdee3]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${width}%`,
              backgroundColor: over
                ? 'var(--status-retard, #dc2626)'
                : 'var(--status-conforme, #047954)',
            }}
          />
        </div>
      )}
      {sub ? (
        <div className="mt-1.5 text-[11px] text-[var(--text-muted,#5f5f5f)]">{sub}</div>
      ) : null}
    </Card>
  )
}

// --- chain leg --------------------------------------------------------------

function LegRow({
  leg,
  title,
  query,
  note,
  t,
}: {
  leg: ChainLeg
  title: string
  query: string
  note?: string
  t: (k: string) => string
}) {
  const tone =
    leg.good === null ? 'neutral' : leg.good ? 'conforme' : 'bientot'
  const label =
    leg.good === null
      ? t('adminOrgDetail.legNoData')
      : leg.good
        ? t('adminOrgDetail.legGood')
        : t('adminOrgDetail.legTodo')

  return (
    <div className="border-b border-[#dcdee3] px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[var(--text-primary,#1a1a1a)]">
              {title}
            </span>
            <StatusChip tone={tone}>{label}</StatusChip>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-[var(--text-hint,#6a6a6a)]">
            {query}
          </p>
          {note ? (
            <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted,#5f5f5f)]">
              {note}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="text-[15px] font-semibold tabular-nums text-[var(--text-primary,#1a1a1a)]">
              {leg.pct === null ? '-' : `${leg.pct}%`}
            </div>
            <div className="text-[11px] tabular-nums text-[var(--text-muted,#5f5f5f)]">
              {leg.met} {t('adminOrgDetail.of')} {leg.total}
            </div>
          </div>
          <span aria-hidden className="text-[var(--text-hint,#6a6a6a)]">
            &rsaquo;
          </span>
        </div>
      </div>

      {leg.pct !== null && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#dcdee3]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${leg.pct}%`,
              backgroundColor: leg.good
                ? 'var(--status-conforme, #047954)'
                : 'var(--status-bientot, #a85c04)',
            }}
          />
        </div>
      )}
    </div>
  )
}

// --- page -------------------------------------------------------------------

export default function AdminOrgDetailView(props: Props) {
  const { language } = useLanguage()
  const t = createTranslator(language)

  const {
    orgName,
    orgSlug,
    accessLevel,
    subscriptionStatus,
    assetCount,
    activeRentals,
    inspections,
    users,
    chain,
    usage,
    billing,
    pilot,
    attention,
    events,
    actions,
  } = props

  const accessTone =
    accessLevel === 'full' ? 'conforme' : accessLevel === 'read_only' ? 'bientot' : 'retard'

  const capacity = billing.licensedCapacity
  const capacityRatio = capacity && capacity > 0 ? assetCount / capacity : null

  const evidenceLeg = chain.legs.find((l) => l.key === 'evidence')
  const legTitles: Record<string, { title: string; query: string; note?: string }> = {
    identity: {
      title: t('adminOrgDetail.legIdentity'),
      query: t('adminOrgDetail.legIdentityQuery'),
      note: t('adminOrgDetail.legIdentitySubstituted'),
    },
    movement: {
      title: t('adminOrgDetail.legMovement'),
      query: t('adminOrgDetail.legMovementQuery'),
    },
    compliance: {
      title: t('adminOrgDetail.legCompliance'),
      query: t('adminOrgDetail.legComplianceQuery'),
    },
    evidence: {
      title: t('adminOrgDetail.legEvidence'),
      query: t('adminOrgDetail.legEvidenceQuery'),
    },
  }

  const usageLabels: Record<string, string> = {
    assets: t('adminOrgDetail.usageAssets'),
    activeRentals: t('adminOrgDetail.usageActiveRentals'),
    scans: t('adminOrgDetail.usageScans'),
    certificates: t('adminOrgDetail.usageCertificates'),
    alerts: t('adminOrgDetail.usageAlerts'),
  }

  const attentionLabels: Record<string, string> = {
    overdue_schedules: t('adminOrgDetail.attentionOverdueSchedules'),
    over_capacity: t('adminOrgDetail.attentionOverCapacity'),
    inspections_without_certificate: t('adminOrgDetail.attentionNoCertificate'),
    rental_outlives_vgp: t('adminOrgDetail.attentionRentalOutlivesVgp'),
    no_recent_signin: t('adminOrgDetail.attentionNoRecentSignin'),
  }

  const eventKindLabel: Record<string, string> = {
    admin: t('adminOrgDetail.eventAdmin'),
    inspection: t('adminOrgDetail.eventInspection'),
    rental: t('adminOrgDetail.eventRental'),
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg,#f6f8fd)] px-6 py-5">
      {/* ===================== Header ===================== */}
      <div className="mb-4">
        <Link
          href="/admin"
          className="text-[12px] text-[var(--accent-text,#b04a06)] hover:underline"
        >
          {t('adminOrgDetail.back')}
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-medium leading-tight text-[var(--text-primary,#1a1a1a)]">
              {orgName}
            </h1>
            <StatusChip tone={accessTone}>{accessLevel}</StatusChip>
            {subscriptionStatus ? (
              <StatusChip tone="neutral">{subscriptionStatus}</StatusChip>
            ) : null}
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-[var(--text-hint,#6a6a6a)]">
            {orgSlug}
          </p>
        </div>
      </div>

      {/* ===================== Stat cards ===================== */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label={t('adminOrgDetail.statCapacity')}
          value={capacity == null ? String(assetCount) : `${assetCount} / ${capacity}`}
          bar={capacityRatio}
          sub={
            capacity == null ? (
              <span className="text-[var(--text-hint,#6a6a6a)]">
                {t('adminOrgDetail.statCapacityNone')}
              </span>
            ) : capacityRatio && capacityRatio > 1 ? (
              <span className="text-[var(--status-retard-ink,#991b1b)]">
                +{assetCount - capacity}
              </span>
            ) : null
          }
        />
        <StatCard
          label={t('adminOrgDetail.statActiveRentals')}
          value={String(activeRentals)}
        />
        <StatCard
          label={t('adminOrgDetail.statInspections')}
          value={String(inspections)}
        />
        <StatCard label={t('adminOrgDetail.statUsers')} value={String(users)} />
        <StatCard
          label={t('adminOrgDetail.statEvidenceScore')}
          value={
            evidenceLeg && evidenceLeg.pct !== null ? `${evidenceLeg.pct}%` : '-'
          }
          bar={
            evidenceLeg && evidenceLeg.pct !== null ? evidenceLeg.pct / 100 : null
          }
          sub={
            evidenceLeg
              ? `${evidenceLeg.met} ${t('adminOrgDetail.of')} ${evidenceLeg.total} ${t('adminOrgDetail.statEvidenceBasis')}`
              : null
          }
        />
      </div>

      {/* ===================== Row 1 ===================== */}
      <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 1. Chaine TraviXO */}
        <Card>
          <PanelHeading
            title={t('adminOrgDetail.chainTitle')}
            note={t('adminOrgDetail.chainSubtitle')}
          />
          {chain.failed ? (
            <FailedLine text={t('adminOrgDetail.readFailed')} error={chain.error} />
          ) : (
            <div>
              {chain.legs.map((leg) => {
                const meta = legTitles[leg.key]
                return (
                  <LegRow
                    key={leg.key}
                    leg={leg}
                    title={meta.title}
                    query={meta.query}
                    note={meta.note}
                    t={t}
                  />
                )
              })}
            </div>
          )}
        </Card>

        {/* 2. Usage reel */}
        <Card>
          <PanelHeading title={t('adminOrgDetail.usageTitle')} />
          {usage.failed ? (
            <FailedLine text={t('adminOrgDetail.readFailed')} error={usage.error} />
          ) : (
            <div className="px-4 py-3">
              <dl className="space-y-2.5">
                {usage.metrics.map((m) => (
                  <div key={m.key} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[12px] text-[var(--text-secondary,#444444)]">
                      {usageLabels[m.key] ?? m.key}
                    </dt>
                    <dd className="text-right">
                      <span className="text-[14px] font-semibold tabular-nums text-[var(--text-primary,#1a1a1a)]">
                        {m.value.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB')}
                      </span>
                      <span className="ml-2 text-[11px] tabular-nums text-[var(--text-muted,#5f5f5f)]">
                        {m.current === null || m.prior === null
                          ? t('adminOrgDetail.usageNoDelta')
                          : `${t('adminOrgDetail.deltaWindow')} ${m.current} / ${t('adminOrgDetail.deltaPriorWindow')} ${m.prior}`}
                      </span>
                    </dd>
                  </div>
                ))}

                <div className="flex items-baseline justify-between gap-3 border-t border-[#dcdee3] pt-2.5">
                  <dt className="text-[12px] text-[var(--text-secondary,#444444)]">
                    {t('adminOrgDetail.usageSites')}
                  </dt>
                  <dd className="text-[14px] font-semibold tabular-nums text-[var(--text-primary,#1a1a1a)]">
                    {usage.sites}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] leading-snug text-[var(--text-hint,#6a6a6a)]">
                {t('adminOrgDetail.usageSitesNote')}
              </p>
            </div>
          )}
        </Card>

        {/* 3. Facturation */}
        <Card>
          <PanelHeading title={t('adminOrgDetail.billingTitle')} />
          {billing.failed ? (
            <FailedLine text={t('adminOrgDetail.readFailed')} error={billing.error} />
          ) : billing.absent ? (
            <OmittedLine text={t('adminOrgDetail.billingNoSubscription')} />
          ) : (
            <div className="px-4 py-3">
              <dl className="space-y-2.5 text-[12px]">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--text-secondary,#444444)]">
                    {t('adminOrgDetail.billingLicensedCapacity')}
                  </dt>
                  <dd className="text-[14px] font-semibold tabular-nums text-[var(--text-primary,#1a1a1a)]">
                    {billing.licensedCapacity ?? t('adminOrgDetail.none')}
                  </dd>
                </div>

                {billing.licensedCapacity != null && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--text-secondary,#444444)]">
                      {t('adminOrgDetail.billingComputedPrice')}
                    </dt>
                    <dd className="text-[14px] font-semibold tabular-nums text-[var(--text-primary,#1a1a1a)]">
                      {formatEuros(monthlyPrice(billing.licensedCapacity), language)}
                      <span className="ml-1 text-[11px] font-normal text-[var(--text-muted,#5f5f5f)]">
                        {t('adminConsole.perMonth')}
                      </span>
                    </dd>
                  </div>
                )}

                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--text-secondary,#444444)]">
                    {t('adminOrgDetail.billingInterval')}
                  </dt>
                  <dd className="text-[var(--text-primary,#1a1a1a)]">
                    {billing.billingCycle ?? t('adminOrgDetail.none')}
                  </dd>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--text-secondary,#444444)]">
                    {t('adminOrgDetail.billingNextDate')}
                  </dt>
                  <dd className="tabular-nums text-[var(--text-primary,#1a1a1a)]">
                    {day(billing.currentPeriodEnd)}
                  </dd>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--text-secondary,#444444)]">
                    {t('adminOrgDetail.billingStripeState')}
                  </dt>
                  <dd>
                    {billing.stripeSubscriptionId ? (
                      <StatusChip tone="conforme">
                        {t('adminOrgDetail.billingStripeLinked')}
                      </StatusChip>
                    ) : (
                      <StatusChip tone="bientot">
                        {t('adminOrgDetail.none')}
                      </StatusChip>
                    )}
                  </dd>
                </div>
              </dl>

              {!billing.stripeSubscriptionId && (
                <p className="mt-2 rounded border border-[#f0dcc0] bg-[#fdf8f1] px-2.5 py-2 text-[11px] leading-snug text-[var(--status-bientot-ink,#8a4b03)]">
                  {t('adminOrgDetail.billingStripeNotLinked')}
                </p>
              )}

              <div className="mt-3 border-t border-[#dcdee3] pt-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-hint,#6a6a6a)]">
                  {t('adminOrgDetail.billingLastWebhook')}
                </div>
                {billing.lastEvent ? (
                  <div className="mt-1 text-[12px] text-[var(--text-primary,#1a1a1a)]">
                    {billing.lastEvent.eventType}
                    <span className="ml-2 tabular-nums text-[var(--text-muted,#5f5f5f)]">
                      {day(billing.lastEvent.createdAt)}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted,#5f5f5f)]">
                    {t('adminOrgDetail.billingNoWebhook')}
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ===================== Row 2 ===================== */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 4. Pilot scope */}
        <Card>
          <PanelHeading title={t('adminOrgDetail.pilotTitle')} />
          {!pilot.applicable ? (
            <OmittedLine text={t('adminOrgDetail.pilotNotApplicable')} />
          ) : (
            <div className="px-4 py-3">
              <dl className="space-y-2.5 text-[12px]">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--text-secondary,#444444)]">
                    {t('adminOrgDetail.pilotStatus')}
                  </dt>
                  <dd>
                    <StatusChip
                      tone={
                        pilot.daysRemaining != null && pilot.daysRemaining < 0
                          ? 'retard'
                          : pilot.daysRemaining != null && pilot.daysRemaining <= 14
                            ? 'bientot'
                            : 'conforme'
                      }
                    >
                      {pilot.daysRemaining != null && pilot.daysRemaining < 0
                        ? t('adminOrgDetail.pilotEnded')
                        : t('adminOrgDetail.pilotActive')}
                    </StatusChip>
                  </dd>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--text-secondary,#444444)]">
                    {t('adminOrgDetail.pilotPeriod')}
                  </dt>
                  <dd className="tabular-nums text-[var(--text-primary,#1a1a1a)]">
                    {day(pilot.startDate)} &rarr; {day(pilot.endDate)}
                  </dd>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--text-secondary,#444444)]">
                    {t('adminOrgDetail.pilotIncludedCapacity')}
                  </dt>
                  <dd className="tabular-nums text-[var(--text-primary,#1a1a1a)]">
                    {pilot.includedCapacity}
                  </dd>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[var(--text-secondary,#444444)]">
                    {t('adminOrgDetail.pilotDaysRemaining')}
                  </dt>
                  <dd className="text-[14px] font-semibold tabular-nums text-[var(--text-primary,#1a1a1a)]">
                    {pilot.daysRemaining ?? '-'}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </Card>

        {/* 5. Points d'attention */}
        <Card>
          <PanelHeading title={t('adminOrgDetail.attentionTitle')} />
          {attention.failed ? (
            <FailedLine text={t('adminOrgDetail.readFailed')} error={attention.error} />
          ) : attention.items.length === 0 ? (
            <div className="m-4 rounded border border-[#bfe3d4] bg-[#eef8f4] px-3 py-2 text-[12px] leading-relaxed text-[var(--status-conforme-ink,#036143)]">
              <span className="font-medium">{t('adminOrgDetail.attentionClean')}</span>{' '}
              {attention.checked.map((c) => attentionLabels[c] ?? c).join(' / ')}
            </div>
          ) : (
            <ul className="divide-y divide-[#dcdee3]">
              {attention.items.map((item) => (
                <li
                  key={item.kind}
                  className="flex items-baseline justify-between gap-3 px-4 py-2.5"
                >
                  <span className="text-[12px] text-[var(--text-secondary,#444444)]">
                    {item.kind === 'no_recent_signin' && item.count === 0
                      ? t('adminOrgDetail.attentionNeverSignedIn')
                      : attentionLabels[item.kind] ?? item.kind}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="text-[14px] font-semibold tabular-nums text-[var(--status-retard-ink,#991b1b)]">
                      {item.detail ?? item.count}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 6. Evenements recents */}
        <Card>
          <PanelHeading title={t('adminOrgDetail.eventsTitle')} />
          {events.failed ? (
            <FailedLine text={t('adminOrgDetail.readFailed')} error={events.error} />
          ) : events.events.length === 0 ? (
            <OmittedLine text={t('adminOrgDetail.eventsNone')} />
          ) : (
            <ul className="divide-y divide-[#dcdee3]">
              {events.events.map((e, i) => (
                <li key={`${e.kind}-${e.at}-${i}`} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] text-[var(--text-primary,#1a1a1a)]">
                      <span className="mr-2 font-mono text-[10px] uppercase text-[var(--text-hint,#6a6a6a)]">
                        {eventKindLabel[e.kind]}
                      </span>
                      {e.label}
                    </span>
                    <span className="shrink-0 tabular-nums text-[11px] text-[var(--text-muted,#5f5f5f)]">
                      {dayTime(e.at)}
                    </span>
                  </div>
                  {e.detail ? (
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted,#5f5f5f)]">
                      {e.detail}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ===================== Existing write controls ===================== */}
      <div className="mt-5">
        <p className="mb-3 rounded border border-[#dcdee3] bg-[#e9ebee] px-3 py-2 text-[11px] leading-snug text-[var(--text-secondary,#444444)]">
          {t('adminOrgDetail.actionsUnavailable')}
        </p>
        {actions}
      </div>
    </div>
  )
}
