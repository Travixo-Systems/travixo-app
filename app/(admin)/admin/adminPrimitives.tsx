'use client'

// app/(admin)/admin/adminPrimitives.tsx
// The shared visual vocabulary of the admin console.
//
// Extracted from AdminOrgDetailView so the overview and the detail page cannot
// drift into two dialects of the same design. Every one of these was defined
// once in that file; they are byte-equivalent here.
//
// VISUAL LANGUAGE
//
// Surfaces and type come from DESIGN_SPEC.md via the tokens declared in
// app/globals.css: --page-bg, --card-bg, --text-primary/secondary/muted/hint,
// and the status triple. Colour carries compliance meaning only, never
// decoration, which is why there are no category-style chips here.
//
// The accent is used through its role variants, never raw: #e8600a is 2.96:1
// on --card-bg and fails AA wherever it carries text, so --accent stays
// decorative and --accent-text / --accent-fill carry type.

import Link from 'next/link'

export function Card({
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

/**
 * Panel header. `href` turns the whole heading into the panel's chevron
 * target, which is how a panel says "there is more of this elsewhere".
 */
export function PanelHeading({
  title,
  note,
  href,
  linkLabel,
}: {
  title: string
  note?: string
  href?: string
  linkLabel?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#dcdee3] px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-[13px] font-medium text-[var(--text-primary,#1a1a1a)]">
          {title}
        </h2>
        {note ? (
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-hint,#6a6a6a)]">
            {note}
          </p>
        ) : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="shrink-0 whitespace-nowrap text-[11px] text-[var(--accent-text,#b04a06)] hover:underline"
        >
          {linkLabel} <span aria-hidden>&rsaquo;</span>
        </Link>
      ) : null}
    </div>
  )
}

/** A read that could not run is never rendered as zero. */
export function FailedLine({ text, error }: { text: string; error: string | null }) {
  return (
    <div className="m-4 rounded border border-[#f0c4c4] bg-[#fdf3f3] px-3 py-2 text-[12px] text-[var(--status-retard-ink,#991b1b)]">
      <span className="font-medium">{text}</span>
      {error ? <span className="ml-2 font-mono text-[11px]">{error}</span> : null}
    </div>
  )
}

/** A panel with no live source says so instead of rendering an empty shell. */
export function OmittedLine({ text }: { text: string }) {
  return (
    <p className="m-4 rounded border border-[#dcdee3] bg-[#e9ebee] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary,#444444)]">
      {text}
    </p>
  )
}

/**
 * A clean check states what it looked at.
 *
 * "Nothing found" is only reassuring when the reader can see the list, so this
 * never renders bare: it always carries the names of the checks that ran.
 */
export function CleanLine({ text }: { text: string }) {
  return (
    <div className="m-4 rounded border border-[#bfe3d4] bg-[#eef8f4] px-3 py-2 text-[12px] leading-relaxed text-[var(--status-conforme-ink,#036143)]">
      {text}
    </div>
  )
}

export type Tone = 'conforme' | 'bientot' | 'retard' | 'neutral'

export function StatusChip({
  tone,
  children,
}: {
  tone: Tone
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

export function StatCard({
  label,
  value,
  sub,
  bar,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: React.ReactNode
  /** 0..1, or null for no bar. Over 1 renders as over-capacity. */
  bar?: number | null
  /**
   * 'retard' paints the card itself as an alert. Reserved for a single card
   * per screen: if everything is red, nothing is.
   */
  tone?: Tone
}) {
  const over = bar != null && bar > 1
  const width = bar == null ? 0 : Math.min(100, Math.round(bar * 100))
  const alert = tone === 'retard'

  return (
    <Card
      className={
        alert
          ? 'border-[#f0c4c4] bg-[#fdf3f3] px-4 py-3'
          : 'px-4 py-3'
      }
    >
      <div
        className={`text-[11px] font-medium uppercase tracking-wide ${
          alert
            ? 'text-[var(--status-retard-ink,#991b1b)]'
            : 'text-[var(--text-hint,#6a6a6a)]'
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-1 text-[22px] font-semibold leading-tight ${
          alert
            ? 'text-[var(--status-retard-ink,#991b1b)]'
            : 'text-[var(--text-primary,#1a1a1a)]'
        }`}
      >
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
        <div
          className={`mt-1.5 text-[11px] ${
            alert
              ? 'text-[var(--status-retard-ink,#991b1b)]'
              : 'text-[var(--text-muted,#5f5f5f)]'
          }`}
        >
          {sub}
        </div>
      ) : null}
    </Card>
  )
}

/**
 * A delta, as two absolute counts against a labelled prior window.
 *
 * Never a percentage. Measured live, the prior 30-day window is zero for most
 * entities on this instance, and a percentage over a zero base is either a
 * division by zero or an invented "+100%".
 */
export function DeltaLine({
  current,
  prior,
  currentLabel,
  priorLabel,
  unavailableLabel,
}: {
  current: number | null
  prior: number | null
  currentLabel: string
  priorLabel: string
  unavailableLabel: string
}) {
  if (current === null || prior === null) {
    return <span className="text-[var(--text-hint,#6a6a6a)]">{unavailableLabel}</span>
  }
  return (
    <span className="tabular-nums">
      {currentLabel} {current} / {priorLabel} {prior}
    </span>
  )
}

/** Locale-aware thousands separators, matching the viewer's language. */
export function formatCount(n: number, language: string): string {
  return n.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB')
}

export function day(value: string | null): string {
  return value ? value.slice(0, 10) : '-'
}

export function dayTime(value: string | null): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '-'
}
