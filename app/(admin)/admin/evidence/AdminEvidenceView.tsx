'use client'

// app/(admin)/admin/evidence/AdminEvidenceView.tsx
// Client island for the evidence page. Renders rows the server already
// computed; it performs no queries and no writes of its own.
//
// It is a client component only because translation runs through
// useLanguage() + createTranslator(), which are client-side. Every visible
// string resolves through lib/i18n.ts in en and fr.
//
// Layout primitives come from ../adminPrimitives, the console's shared visual
// vocabulary: --page-bg ground, --card-bg panels with 0.5px #dcdee3 rules,
// 11/12/13px type, and status chips in the compliance triple. Colour carries
// compliance meaning only. This page previously carried its own gray-50 and
// white palette; it now matches the overview and the organisation detail page
// rather than being a third dialect.
//
// Nothing about the detectors changed: the same rules, the same i18n keys, the
// same failed-before-empty ordering that verify-admin-evidence.mjs asserts.

import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import { CleanLine, FailedLine, StatusChip, type Tone } from '../adminPrimitives'
import type { DisagreementResult } from '@/lib/admin/evidence/atomicDisagreement'
import type { DocumentaryGapResult } from '@/lib/admin/evidence/documentaryGaps'
import type { RentalExpiryResult } from '@/lib/admin/evidence/rentalExpiry'

interface Props {
  d1: DisagreementResult
  d2: DocumentaryGapResult
  d3: RentalExpiryResult
  orgNames: Record<string, string>
}

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : '-'
}

function day(value: string | null): string {
  return value ? value.slice(0, 10) : '-'
}

/**
 * Severity chip, mapped onto the console's compliance triple.
 *
 * The detectors speak in red/amber/green; the shared StatusChip speaks in
 * retard/bientot/conforme. Same meaning, one vocabulary, so this page and the
 * rest of the console cannot drift apart.
 */
function Chip({
  tone,
  children,
}: {
  tone: 'red' | 'amber' | 'green' | 'gray'
  children: React.ReactNode
}) {
  const mapped: Tone =
    tone === 'red'
      ? 'retard'
      : tone === 'amber'
        ? 'bientot'
        : tone === 'green'
          ? 'conforme'
          : 'neutral'
  return <StatusChip tone={mapped}>{children}</StatusChip>
}

/**
 * The rule, stated before the rows.
 *
 * A detector that shows rows without stating what it looked for asks the
 * reader to reverse-engineer the query from the results.
 */
function Rule({ label, body }: { label: string; body: string }) {
  return (
    <div className="mb-3 rounded border border-[#dcdee3] bg-[#e9ebee] px-3 py-2 text-[11px] leading-snug text-[var(--text-secondary,#444444)]">
      <span className="font-medium">{label}. </span>
      {body}
    </div>
  )
}

const TH =
  'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-hint,#6a6a6a)]'
const TD = 'px-3 py-2 text-[12px] text-[var(--text-secondary,#444444)]'

function TableShell({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#dcdee3] bg-[var(--card-bg,#edeef1)]">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-[#dcdee3]">{head}</tr>
        </thead>
        <tbody className="divide-y divide-[#dcdee3]">{children}</tbody>
      </table>
    </div>
  )
}

export default function AdminEvidenceView({ d1, d2, d3, orgNames }: Props) {
  const { language } = useLanguage()
  const t = createTranslator(language)

  const org = (id: string) => orgNames[id] ?? id.slice(0, 8)

  return (
    <div className="min-h-screen space-y-5 bg-[var(--page-bg,#f6f8fd)] px-6 py-5">
      <section>
        <h1 className="text-[20px] font-medium leading-tight text-[var(--text-primary,#1a1a1a)]">
          {t('adminEvidence.pageTitle')}
        </h1>
        <p className="mt-0.5 text-[11px] text-[var(--text-hint,#6a6a6a)]">
          {t('adminEvidence.pageSubtitle')}
        </p>
      </section>

      {/* ==================== D1 ATOMIC DISAGREEMENT ==================== */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium text-[var(--text-primary,#1a1a1a)]">{t('adminEvidence.d1Title')}</h2>
          <span className="text-[11px] tabular-nums text-[var(--text-muted,#5f5f5f)]">
            {d1.rows.length} {t('adminEvidence.rowsFound')}
          </span>
        </div>

        <Rule label={t('adminEvidence.ruleHeading')} body={t('adminEvidence.d1Rule')} />
        <Rule label={t('adminEvidence.ruleHeading')} body={t('adminEvidence.d1RuleExcluded')} />

        {d1.failed ? (
          <FailedLine text={t('adminEvidence.detectorFailed')} error={d1.error} />
        ) : d1.rows.length === 0 ? (
          <CleanLine text={t('adminEvidence.d1Clean')} />
        ) : (
          <>
            <TableShell
              head={
                <>
                  <th className={TH}>{t('adminEvidence.colRule')}</th>
                  <th className={TH}>{t('adminEvidence.colOrg')}</th>
                  <th className={TH}>{t('adminEvidence.colAsset')}</th>
                  <th className={TH}>{t('adminEvidence.colAssetStatus')}</th>
                  <th className={TH}>{t('adminEvidence.colResult')}</th>
                  <th className={TH}>{t('adminEvidence.colInspectionDate')}</th>
                  <th className={TH}>{t('adminEvidence.colScheduleStatus')}</th>
                  <th className={TH}>{t('adminEvidence.colInspection')}</th>
                  <th className={TH}>{t('adminEvidence.colSchedule')}</th>
                  <th className={TH}>{t('adminEvidence.colCreated')}</th>
                </>
              }
            >
              {d1.rows.map((r) => (
                <tr key={`${r.rule}-${r.inspectionId}`} className="hover:bg-[rgba(0,0,0,0.02)]">
                  <td className="px-3 py-2">
                    {r.rule === 'failed_asset_in_service' ? (
                      <Chip tone="red">{t('adminEvidence.d1RuleA')}</Chip>
                    ) : (
                      <Chip tone="amber">{t('adminEvidence.d1RuleB')}</Chip>
                    )}
                  </td>
                  <td className={TD}>{org(r.organizationId)}</td>
                  <td className="px-3 py-2 text-[12px] font-medium text-[var(--text-primary,#1a1a1a)]">{r.assetName}</td>
                  <td className={TD}>
                    <span className="font-mono text-[11px]">{r.assetStatus}</span>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-[11px]">{r.inspectionResult}</span>
                  </td>
                  <td className={TD}>{day(r.inspectionDate)}</td>
                  <td className={TD}>
                    <span className="font-mono text-[11px]">{r.scheduleStatus ?? '-'}</span>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-[11px]">{shortId(r.inspectionId)}</span>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-[11px]">{shortId(r.scheduleId)}</span>
                  </td>
                  <td className={TD}>{day(r.inspectionCreatedAt)}</td>
                </tr>
              ))}
            </TableShell>
            <p className="mt-2 text-[11px] leading-snug text-[var(--text-muted,#5f5f5f)]">{t('adminEvidence.legacyNote')}</p>
          </>
        )}

        {!d1.failed && (
          <p className="mt-2 text-[11px] leading-snug text-[var(--text-hint,#6a6a6a)]">
            {d1.assetsInspected} {t('adminEvidence.d1AssetsInspected')}
          </p>
        )}
      </section>

      {/* ==================== D2 DOCUMENTARY GAPS ====================== */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium text-[var(--text-primary,#1a1a1a)]">{t('adminEvidence.d2Title')}</h2>
          <span className="text-[11px] tabular-nums text-[var(--text-muted,#5f5f5f)]">
            {d2.rows.length} {t('adminEvidence.rowsFound')}
          </span>
        </div>

        <Rule label={t('adminEvidence.ruleHeading')} body={t('adminEvidence.d2Rule')} />

        {d2.failed ? (
          <FailedLine text={t('adminEvidence.detectorFailed')} error={d2.error} />
        ) : d2.rows.length === 0 ? (
          <CleanLine text={t('adminEvidence.d2Clean')} />
        ) : (
          <>
            <TableShell
              head={
                <>
                  <th className={TH}>{t('adminEvidence.colKind')}</th>
                  <th className={TH}>{t('adminEvidence.colOrg')}</th>
                  <th className={TH}>{t('adminEvidence.colAsset')}</th>
                  <th className={TH}>{t('adminEvidence.colResult')}</th>
                  <th className={TH}>{t('adminEvidence.colInspectionDate')}</th>
                  <th className={TH}>{t('adminEvidence.colCertificate')}</th>
                  <th className={TH}>{t('adminEvidence.colInspection')}</th>
                  <th className={TH}>{t('adminEvidence.colCreated')}</th>
                </>
              }
            >
              {d2.rows.map((r) => (
                <tr key={`${r.kind}-${r.inspectionId}`} className="hover:bg-[rgba(0,0,0,0.02)]">
                  <td className="px-3 py-2">
                    {r.kind === 'unresolvable_reference' ? (
                      <Chip tone="red">{t('adminEvidence.d2GapB')}</Chip>
                    ) : (
                      <Chip tone="amber">{t('adminEvidence.d2GapA')}</Chip>
                    )}
                  </td>
                  <td className={TD}>{org(r.organizationId)}</td>
                  <td className="px-3 py-2 text-[12px] font-medium text-[var(--text-primary,#1a1a1a)]">{r.assetName ?? shortId(r.assetId)}</td>
                  <td className={TD}>
                    <span className="font-mono text-[11px]">{r.inspectionResult}</span>
                  </td>
                  <td className={TD}>{day(r.inspectionDate)}</td>
                  <td className={TD}>
                    {r.certificateFileName ?? (r.certificateUrl ? shortId(r.certificateUrl) : t('adminEvidence.none'))}
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-[11px]">{shortId(r.inspectionId)}</span>
                  </td>
                  <td className={TD}>{day(r.createdAt)}</td>
                </tr>
              ))}
            </TableShell>
            <p className="mt-2 text-[11px] leading-snug text-[var(--text-muted,#5f5f5f)]">{t('adminEvidence.legacyNote')}</p>
          </>
        )}

        {!d2.failed && (
          <p className="mt-2 text-[11px] leading-snug text-[var(--text-hint,#6a6a6a)]">
            {d2.withCertificate}/{d2.inspectionsTotal} {t('adminEvidence.d2WithCertificate')}
          </p>
        )}
      </section>

      {/* ==================== D3 RENTAL EXPIRY ========================= */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[13px] font-medium text-[var(--text-primary,#1a1a1a)]">{t('adminEvidence.d3Title')}</h2>
          <span className="text-[11px] tabular-nums text-[var(--text-muted,#5f5f5f)]">
            {d3.rows.length} {t('adminEvidence.rowsFound')}
          </span>
        </div>

        <Rule label={t('adminEvidence.ruleHeading')} body={t('adminEvidence.d3Rule')} />

        {d3.failed ? (
          <FailedLine text={t('adminEvidence.detectorFailed')} error={d3.error} />
        ) : d3.rows.length === 0 ? (
          <CleanLine text={t('adminEvidence.d3Clean')} />
        ) : (
          <>
            {d3.worst && (
              <div className="mb-3 rounded border border-[#f0c4c4] bg-[#fdf3f3] px-3 py-2 text-[12px] text-[var(--status-retard-ink,#991b1b)]">
                <span className="font-medium">{t('adminEvidence.d3WorstOffender')}: </span>
                {org(d3.worst.organizationId)} / {d3.worst.assetName ?? shortId(d3.worst.assetId)} -{' '}
                {d3.worst.daysOverdueAtReturn} {t('adminEvidence.d3Days')}
              </div>
            )}

            <TableShell
              head={
                <>
                  <th className={TH}>{t('adminEvidence.colOrg')}</th>
                  <th className={TH}>{t('adminEvidence.colAsset')}</th>
                  <th className={TH}>{t('adminEvidence.colClient')}</th>
                  <th className={TH}>{t('adminEvidence.colCheckout')}</th>
                  <th className={TH}>{t('adminEvidence.colNextDue')}</th>
                  <th className={TH}>{t('adminEvidence.colExpectedReturn')}</th>
                  <th className={`${TH} text-right`}>{t('adminEvidence.colDaysOver')}</th>
                  <th className={TH}>{t('adminEvidence.colRental')}</th>
                  <th className={TH}>{t('adminEvidence.colSchedule')}</th>
                </>
              }
            >
              {d3.rows.map((r) => (
                <tr key={r.rentalId} className="hover:bg-[rgba(0,0,0,0.02)]">
                  <td className={TD}>{org(r.organizationId)}</td>
                  <td className="px-3 py-2 text-[12px] font-medium text-[var(--text-primary,#1a1a1a)]">{r.assetName ?? shortId(r.assetId)}</td>
                  <td className={TD}>{r.clientName}</td>
                  <td className={TD}>{day(r.checkoutDate)}</td>
                  <td className={TD}>{day(r.nextDueDate)}</td>
                  <td className={TD}>{day(r.expectedReturnDate)}</td>
                  <td className="px-4 py-3 text-right">
                    <Chip tone="red">{r.daysOverdueAtReturn}</Chip>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-[11px]">{shortId(r.rentalId)}</span>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-[11px]">{shortId(r.scheduleId)}</span>
                  </td>
                </tr>
              ))}
            </TableShell>

            {Object.keys(d3.perOrg).length > 0 && (
              <div className="mt-3 text-[11px] text-[var(--text-muted,#5f5f5f)]">
                <span className="font-medium">{t('adminEvidence.d3PerOrg')}: </span>
                {Object.entries(d3.perOrg)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, n]) => `${org(id)} (${n})`)
                  .join(', ')}
              </div>
            )}
          </>
        )}

        {/* The second condition. Reported even when the rule itself is clean:
            a rented machine with no schedule cannot breach, and that is
            exactly why counting only breaches would score it as fine. */}
        {!d3.failed && d3.unscheduled.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 rounded border border-[#f0dcc0] bg-[#fdf8f1] px-3 py-2 text-[11px] leading-snug text-[var(--status-bientot-ink,#8a4b03)]">
              {t('adminEvidence.d3Unscheduled')}
            </div>
            <TableShell
              head={
                <>
                  <th className={TH}>{t('adminEvidence.colOrg')}</th>
                  <th className={TH}>{t('adminEvidence.colAsset')}</th>
                  <th className={TH}>{t('adminEvidence.colClient')}</th>
                  <th className={TH}>{t('adminEvidence.colExpectedReturn')}</th>
                  <th className={TH}>{t('adminEvidence.colRental')}</th>
                </>
              }
            >
              {d3.unscheduled.map((r) => (
                <tr key={r.rentalId} className="hover:bg-[rgba(0,0,0,0.02)]">
                  <td className={TD}>{org(r.organizationId)}</td>
                  <td className="px-3 py-2 text-[12px] font-medium text-[var(--text-primary,#1a1a1a)]">{r.assetName ?? shortId(r.assetId)}</td>
                  <td className={TD}>{r.clientName}</td>
                  <td className={TD}>{day(r.expectedReturnDate)}</td>
                  <td className={TD}>
                    <span className="font-mono text-[11px]">{shortId(r.rentalId)}</span>
                  </td>
                </tr>
              ))}
            </TableShell>
          </div>
        )}

        {!d3.failed && d3.withoutReturnDate > 0 && (
          <p className="mt-2 text-[11px] leading-snug text-[var(--text-hint,#6a6a6a)]">
            {d3.withoutReturnDate} {t('adminEvidence.d3NoReturnDate')}
          </p>
        )}
      </section>
    </div>
  )
}
