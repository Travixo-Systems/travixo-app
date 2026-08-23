'use client'

/**
 * Semantic status badge - the single source of truth for compliance/urgency
 * pills across the app.
 *
 * Two accessibility rules are baked in here so callers cannot get them wrong:
 *
 * 1. WCAG 1.4.1 (Use of Colour). Status is never carried by hue alone - each
 *    tone has its own glyph, so "en retard" and "bientôt" stay distinguishable
 *    under deuteranopia, where red and amber collapse into the same colour.
 *
 * 2. WCAG 1.4.3 (Contrast). Small text needs 4.5:1. The raw status colours are
 *    too light against their own tinted fills (2.49-3.59:1), so each tone
 *    pairs a darkened ink with a 12% fill of the base hue:
 *      retard   #991b1b on #ebd6d9 = 6.00:1
 *      bientot  #8a4b03 on #ebe0d5 = 5.23:1
 *      conforme #036143 on #d1e3e1 = 5.65:1
 *
 * Type is 12px rather than 11px: the primary users are depot staff, often 45+
 * and reading outdoors where glare cuts effective contrast.
 */

type Tone = 'retard' | 'bientot' | 'conforme' | 'neutral'

interface ToneStyle {
  ink: string
  fill: string
  Icon: (props: { className?: string }) => React.ReactElement
}

/* -------------------------------------------------------------------------
   Icons. Deliberately hand-authored 16px strokes rather than an icon-library
   import: they must stay legible at 13px inside a pill, which the general
   purpose icon sets are not drawn for. currentColor so they inherit the ink.
   ------------------------------------------------------------------------- */

/** Warning triangle - overdue, requires action now. */
function IconAlert({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true" focusable="false">
      <path
        d="M8 2.4 1.9 13.1h12.2L8 2.4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8 6.4v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.3" r=".95" fill="currentColor" />
    </svg>
  )
}

/** Clock - a deadline approaching but not yet passed. */
function IconClock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="5.9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.6V8l2.3 1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Check in a circle - compliant, nothing to do. */
function IconCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="5.9" stroke="currentColor" strokeWidth="1.6" />
      <path d="m5.4 8.2 1.9 1.9 3.4-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Dash in a circle - no schedule, status genuinely unknown. */
function IconUnknown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="5.9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

const TONES: Record<Tone, ToneStyle> = {
  retard: { ink: '#991b1b', fill: '#ebd6d9', Icon: IconAlert },
  bientot: { ink: '#8a4b03', fill: '#ebe0d5', Icon: IconClock },
  conforme: { ink: '#036143', fill: '#d1e3e1', Icon: IconCheck },
  neutral: { ink: '#3f4650', fill: '#dfe2e6', Icon: IconUnknown },
}

export interface StatusBadgeProps {
  tone: Tone
  children: React.ReactNode
  /** Hide the glyph. Only for dense tables that already encode status another way. */
  hideIcon?: boolean
  className?: string
}

export default function StatusBadge({ tone, children, hideIcon, className = '' }: StatusBadgeProps) {
  const { ink, fill, Icon } = TONES[tone] ?? TONES.neutral

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${className}`}
      style={{ backgroundColor: fill, color: ink }}
    >
      {!hideIcon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
      {children}
    </span>
  )
}

/** Days-remaining helper so callers pick a tone consistently. */
export function toneForDays(days: number | null | undefined): Tone {
  if (days === null || days === undefined) return 'neutral'
  if (days < 0) return 'retard'
  if (days <= 30) return 'bientot'
  return 'conforme'
}
