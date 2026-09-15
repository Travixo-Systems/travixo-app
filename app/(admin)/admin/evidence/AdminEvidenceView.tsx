'use client'

// app/(admin)/admin/evidence/AdminEvidenceView.tsx
// Client island for the evidence page. Renders rows the server already
// computed; it performs no queries and no writes of its own.
//
// It is a client component only because translation runs through
// useLanguage() + createTranslator(), which are client-side. Every visible
// string resolves through lib/i18n.ts in en and fr.
//
// Layout primitives match the existing admin pages exactly (see
// docs/ADMIN-ACTUAL.md item 6): gray-50 ground, white cards with
// border-gray-200 and rounded-lg, tables with a gray-50 uppercase head and
// divide-y bodies, semantic chips in the established colour pairs.

import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
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

/** Severity chip. red = acts on safety now, amber = degrades a control. */
function Chip({ tone, children }: { tone: 'red' | 'amber' | 'green' | 'gray'; children: React.ReactNode }) {
  const cls =
    tone === 'red'
      ? 'bg-red-100 text-red-800'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-800'
        : tone === 'green'
          ? 'bg-green-100 text-green-800'
          : 'bg-gray-200 text-gray-700'
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  )
}

/** The green line. A clean detector says so out loud rather than vanishing. */
function CleanLine({ text }: { text: string }) {
  return (
    <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
      {text}
    </div>
  )
}

/** A detector that could not run is never rendered as clean. */
function FailedLine({ text, error }: { text: string; error: string | null }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <span className="font-medium">{text}</span>
      {error ? <span className="ml-2 font-mono text-xs">{error}</span> : null}
    </div>
  )
}

function Rule({ label, body }: { label: string; body: string }) {
  return (
    <div className="mb-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
      <span className="font-medium">{label}. </span>
      {body}
    </div>
  )
}

const TH = 'px-4 py-3 font-medium'
const TD = 'px-4 py-3 text-gray-600'

function TableShell({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  )
}

export default function AdminEvidenceView({ d1, d2, d3, orgNames }: Props) {
  const { language } = useLanguage()
  const t = createTranslator(language)

  const org = (id: string) => orgNames[id] ?? id.slice(0, 8)

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-xl font-semibold">{t('adminEvidence.pageTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('adminEvidence.pageSubtitle')}</p>
      </section>

      {/* ==================== D1 ATOMIC DISAGREEMENT ==================== */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">{t('adminEvidence.d1Title')}</h2>
          <span className="text-sm text-gray-500">
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
                <tr key={`${r.rule}-${r.inspectionId}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {r.rule === 'failed_asset_in_service' ? (
                      <Chip tone="red">{t('adminEvidence.d1RuleA')}</Chip>
                    ) : (
                      <Chip tone="amber">{t('adminEvidence.d1RuleB')}</Chip>
                    )}
                  </td>
                  <td className={TD}>{org(r.organizationId)}</td>
                  <td className="px-4 py-3 text-gray-900">{r.assetName}</td>
                  <td className={TD}>
                    <span className="font-mono text-xs">{r.assetStatus}</span>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-xs">{r.inspectionResult}</span>
                  </td>
                  <td className={TD}>{day(r.inspectionDate)}</td>
                  <td className={TD}>
                    <span className="font-mono text-xs">{r.scheduleStatus ?? '-'}</span>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-xs">{shortId(r.inspectionId)}</span>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-xs">{shortId(r.scheduleId)}</span>
                  </td>
                  <td className={TD}>{day(r.inspectionCreatedAt)}</td>
                </tr>
              ))}
            </TableShell>
            <p className="mt-2 text-xs text-gray-500">{t('adminEvidence.legacyNote')}</p>
          </>
        )}

        {!d1.failed && (
          <p className="mt-2 text-xs text-gray-400">
            {d1.assetsInspected} {t('adminEvidence.d1AssetsInspected')}
          </p>
        )}
      </section>

      {/* ==================== D2 DOCUMENTARY GAPS ====================== */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">{t('adminEvidence.d2Title')}</h2>
          <span className="text-sm text-gray-500">
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
                <tr key={`${r.kind}-${r.inspectionId}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {r.kind === 'unresolvable_reference' ? (
                      <Chip tone="red">{t('adminEvidence.d2GapB')}</Chip>
                    ) : (
                      <Chip tone="amber">{t('adminEvidence.d2GapA')}</Chip>
                    )}
                  </td>
                  <td className={TD}>{org(r.organizationId)}</td>
                  <td className="px-4 py-3 text-gray-900">{r.assetName ?? shortId(r.assetId)}</td>
                  <td className={TD}>
                    <span className="font-mono text-xs">{r.inspectionResult}</span>
                  </td>
                  <td className={TD}>{day(r.inspectionDate)}</td>
                  <td className={TD}>
                    {r.certificateFileName ?? (r.certificateUrl ? shortId(r.certificateUrl) : t('adminEvidence.none'))}
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-xs">{shortId(r.inspectionId)}</span>
                  </td>
                  <td className={TD}>{day(r.createdAt)}</td>
                </tr>
              ))}
            </TableShell>
            <p className="mt-2 text-xs text-gray-500">{t('adminEvidence.legacyNote')}</p>
          </>
        )}

        {!d2.failed && (
          <p className="mt-2 text-xs text-gray-400">
            {d2.withCertificate}/{d2.inspectionsTotal} {t('adminEvidence.d2WithCertificate')}
          </p>
        )}
      </section>

      {/* ==================== D3 RENTAL EXPIRY ========================= */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">{t('adminEvidence.d3Title')}</h2>
          <span className="text-sm text-gray-500">
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
              <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
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
                <tr key={r.rentalId} className="hover:bg-gray-50">
                  <td className={TD}>{org(r.organizationId)}</td>
                  <td className="px-4 py-3 text-gray-900">{r.assetName ?? shortId(r.assetId)}</td>
                  <td className={TD}>{r.clientName}</td>
                  <td className={TD}>{day(r.checkoutDate)}</td>
                  <td className={TD}>{day(r.nextDueDate)}</td>
                  <td className={TD}>{day(r.expectedReturnDate)}</td>
                  <td className="px-4 py-3 text-right">
                    <Chip tone="red">{r.daysOverdueAtReturn}</Chip>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-xs">{shortId(r.rentalId)}</span>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-xs">{shortId(r.scheduleId)}</span>
                  </td>
                </tr>
              ))}
            </TableShell>

            {Object.keys(d3.perOrg).length > 0 && (
              <div className="mt-3 text-xs text-gray-500">
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
            <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
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
                <tr key={r.rentalId} className="hover:bg-gray-50">
                  <td className={TD}>{org(r.organizationId)}</td>
                  <td className="px-4 py-3 text-gray-900">{r.assetName ?? shortId(r.assetId)}</td>
                  <td className={TD}>{r.clientName}</td>
                  <td className={TD}>{day(r.expectedReturnDate)}</td>
                  <td className={TD}>
                    <span className="font-mono text-xs">{shortId(r.rentalId)}</span>
                  </td>
                </tr>
              ))}
            </TableShell>
          </div>
        )}

        {!d3.failed && d3.withoutReturnDate > 0 && (
          <p className="mt-2 text-xs text-gray-400">
            {d3.withoutReturnDate} {t('adminEvidence.d3NoReturnDate')}
          </p>
        )}
      </section>
    </div>
  )
}
