'use client'

/**
 * Unified event history for a single machine.
 *
 * The asset page already shows inspections and rentals as two separate
 * tables, and scans not at all. That split is the thing this component
 * exists to remove: when someone asks "what happened to this machine",
 * the answer should be one column read top to bottom, not three lists
 * cross-referenced by date.
 *
 * Inspections and rentals arrive as props because the parent has already
 * fetched them -- refetching here would double the queries for the same
 * rows. Scans are fetched here because nothing else on the page needs
 * them, and they are the most numerous source (one row per QR hit).
 *
 * A rental produces up to TWO events, not one: a checkout and, when it
 * has come back, a return. Collapsing them into a single row is what
 * makes a rental history unreadable next to the scans it generated.
 */

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import {
  ClipboardCheck,
  ArrowUpRight,
  ArrowDownLeft,
  QrCode,
  MapPin,
  FileText,
  ScanLine,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface Scan {
  id: string
  scan_type: string | null
  location_name: string | null
  notes: string | null
  scanned_at: string
}

interface InspectionInput {
  id: string
  inspection_date: string
  inspector_name: string
  inspector_company: string | null
  result: string
  certificate_url: string | null
}

interface RentalInput {
  id: string
  client_id: string | null
  client_name: string
  checkout_date: string
  expected_return_date: string | null
  actual_return_date: string | null
  status: string
}

type EventKind = 'inspection' | 'checkout' | 'return' | 'scan'

interface TimelineEvent {
  key: string
  kind: EventKind
  /** ISO timestamp used for ordering. */
  at: string
  title: string
  detail: string | null
  /** Rendered as a link when present. */
  href?: string
  hrefLabel?: string
  location?: string | null
}

interface Props {
  assetId: string
  inspections: InspectionInput[]
  rentals: RentalInput[]
}

// ============================================================================
// PRESENTATION
// ============================================================================

/**
 * One tone per event kind. Inspections and returns are the two states that
 * mean "this machine is accounted for", so they share the compliant green;
 * a checkout is neutral movement, and a bare scan is quieter still -- it is
 * evidence of presence, not of a decision someone made.
 */
const KIND_STYLE: Record<EventKind, { ink: string; fill: string; Icon: typeof QrCode }> = {
  inspection: { ink: '#036143', fill: '#d1e3e1', Icon: ClipboardCheck },
  checkout: { ink: '#444444', fill: '#e8e9eb', Icon: ArrowUpRight },
  return: { ink: '#036143', fill: '#d1e3e1', Icon: ArrowDownLeft },
  scan: { ink: '#5b6670', fill: '#eef0f2', Icon: ScanLine },
}

const KIND_LABEL: Record<EventKind, { fr: string; en: string }> = {
  inspection: { fr: 'Inspection VGP', en: 'VGP inspection' },
  checkout: { fr: 'Sortie', en: 'Checkout' },
  return: { fr: 'Retour', en: 'Return' },
  scan: { fr: 'Scan', en: 'Scan' },
}

/** scan_type values written by the RPCs and the public QR route. */
const SCAN_TYPE_LABEL: Record<string, { fr: string; en: string }> = {
  check: { fr: 'Vérification', en: 'Check' },
  checkout: { fr: 'Sortie', en: 'Checkout' },
  return: { fr: 'Retour', en: 'Return' },
  inventory: { fr: 'Inventaire', en: 'Inventory' },
}

function formatStamp(iso: string, language: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB'
  // Date-only values (inspections, checkouts) carry a midnight time that
  // would read as a real 00:00 event; show the clock only when the source
  // actually recorded one.
  const hasClock = iso.includes('T') && !iso.startsWith(iso.slice(0, 10) + 'T00:00:00')
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(hasClock ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AssetHistoryTimeline({ assetId, inspections, rentals }: Props) {
  const { language } = useLanguage()
  const isFr = language === 'fr'

  const [scans, setScans] = useState<Scan[]>([])
  const [scansLoading, setScansLoading] = useState(true)
  const [scansFailed, setScansFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function loadScans() {
      setScansLoading(true)
      setScansFailed(false)
      const { data, error } = await supabase
        .from('scans')
        .select('id, scan_type, location_name, notes, scanned_at')
        .eq('asset_id', assetId)
        .order('scanned_at', { ascending: false })
        .limit(200)

      if (cancelled) return
      if (error) {
        // The rest of the history is still worth showing, so this degrades
        // to a note rather than blanking the section.
        console.error('Error loading scans for timeline:', error)
        setScansFailed(true)
        setScans([])
      } else {
        setScans((data || []) as Scan[])
      }
      setScansLoading(false)
    }

    loadScans()
    return () => { cancelled = true }
  }, [assetId])

  const events = useMemo<TimelineEvent[]>(() => {
    const out: TimelineEvent[] = []

    for (const i of inspections) {
      const company = i.inspector_company ? ` · ${i.inspector_company}` : ''
      out.push({
        key: `insp-${i.id}`,
        kind: 'inspection',
        at: i.inspection_date,
        title: KIND_LABEL.inspection[isFr ? 'fr' : 'en'],
        detail: `${i.inspector_name}${company}`,
        href: i.certificate_url || undefined,
        hrefLabel: isFr ? 'Certificat PDF' : 'PDF certificate',
      })
    }

    for (const r of rentals) {
      out.push({
        key: `out-${r.id}`,
        kind: 'checkout',
        at: r.checkout_date,
        title: KIND_LABEL.checkout[isFr ? 'fr' : 'en'],
        detail: r.client_name,
        href: r.client_id ? `/clients/${r.client_id}` : undefined,
        hrefLabel: isFr ? 'Voir le client' : 'View client',
      })
      if (r.actual_return_date) {
        out.push({
          key: `in-${r.id}`,
          kind: 'return',
          at: r.actual_return_date,
          title: KIND_LABEL.return[isFr ? 'fr' : 'en'],
          detail: r.client_name,
        })
      }
    }

    for (const s of scans) {
      const typeKey = (s.scan_type || 'check').toLowerCase()
      const typeLabel = SCAN_TYPE_LABEL[typeKey]
        ? SCAN_TYPE_LABEL[typeKey][isFr ? 'fr' : 'en']
        : typeKey
      out.push({
        key: `scan-${s.id}`,
        kind: 'scan',
        at: s.scanned_at,
        title: `${KIND_LABEL.scan[isFr ? 'fr' : 'en']} · ${typeLabel}`,
        detail: s.notes,
        location: s.location_name,
      })
    }

    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [inspections, rentals, scans, isFr])

  const COLLAPSED = 8
  const visible = expanded ? events : events.slice(0, COLLAPSED)
  const hidden = events.length - visible.length

  return (
    <div className="bg-white rounded-lg p-5 sm:p-6" style={{ border: '1px solid #dcdee3' }}>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-xs font-semibold tracking-wider" style={{ color: '#6b7280' }}>
          {isFr ? 'HISTORIQUE COMPLET' : 'FULL HISTORY'}
        </h2>
        <span className="text-xs tabular-nums" style={{ color: '#9aa5ab' }}>
          {events.length}{' '}
          {isFr
            ? events.length === 1 ? 'événement' : 'événements'
            : events.length === 1 ? 'event' : 'events'}
        </span>
      </div>
      <p className="text-xs mb-4" style={{ color: '#9aa5ab' }}>
        {isFr
          ? 'Inspections, locations et scans terrain, dans l’ordre.'
          : 'Inspections, rentals and field scans, in order.'}
      </p>

      {scansLoading && events.length === 0 ? (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[52px] rounded animate-pulse" style={{ background: '#f1f3f4' }} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: '#9aa5ab' }}>
          {isFr
            ? 'Aucun événement enregistré pour cette machine.'
            : 'No events recorded for this machine yet.'}
        </p>
      ) : (
        <>
          <ol className="relative">
            {visible.map((e, idx) => {
              const style = KIND_STYLE[e.kind]
              const Icon = style.Icon
              const isLast = idx === visible.length - 1
              return (
                <li key={e.key} className="relative flex gap-3 pb-4">
                  {/* rail */}
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[15px] top-[32px] bottom-0 w-px"
                      style={{ background: '#e5e7eb' }}
                    />
                  )}
                  <span
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: style.fill, color: style.ink }}
                    aria-hidden="true"
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1 pt-[3px]">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold" style={{ color: '#1f2933' }}>
                        {e.title}
                      </span>
                      <span className="text-xs tabular-nums" style={{ color: '#9aa5ab' }}>
                        {formatStamp(e.at, language)}
                      </span>
                    </div>
                    {e.detail && (
                      <p className="text-sm mt-0.5 truncate" style={{ color: '#5b6670' }}>
                        {e.detail}
                      </p>
                    )}
                    {e.location && (
                      <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#9aa5ab' }}>
                        <MapPin className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                        <span className="truncate">{e.location}</span>
                      </p>
                    )}
                    {e.href && (
                      <a
                        href={e.href}
                        target={e.href.startsWith('http') ? '_blank' : undefined}
                        rel={e.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        className="inline-flex items-center gap-1 text-xs mt-1 hover:underline focus:outline-none focus:ring-2 focus:ring-offset-1 rounded"
                        style={{ color: '#f26f00' }}
                      >
                        <FileText className="w-3 h-3" aria-hidden="true" />
                        {e.hrefLabel}
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>

          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full text-sm py-2 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 min-h-[44px]"
              style={{ color: '#f26f00' }}
            >
              {isFr ? `Afficher ${hidden} événement${hidden > 1 ? 's' : ''} de plus` : `Show ${hidden} more event${hidden > 1 ? 's' : ''}`}
            </button>
          )}

          {scansFailed && (
            <p className="text-xs mt-3" style={{ color: '#9aa5ab' }}>
              {isFr
                ? 'Les scans terrain n’ont pas pu être chargés.'
                : 'Field scans could not be loaded.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
