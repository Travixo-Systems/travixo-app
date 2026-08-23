// components/vgp/VGPStatusBadge.tsx
// Audit fix: ui-ux-audit.md §3.1, §3.2, §3.3, VGP status not visible at a glance
'use client';

import { useLanguage } from '@/lib/LanguageContext';

export type VGPStatus = 'overdue' | 'upcoming' | 'compliant' | 'unknown';

interface StatusConfig {
  labelFr: string;
  labelEn: string;
}

const STATUS_CONFIG: Record<VGPStatus, StatusConfig> = {
  overdue: {
    labelFr: 'En retard',
    labelEn: 'Overdue',
  },
  upcoming: {
    labelFr: 'À venir',
    labelEn: 'Upcoming',
  },
  compliant: {
    labelFr: 'Conforme',
    labelEn: 'Compliant',
  },
  unknown: {
    labelFr: 'Non planifié',
    labelEn: 'Not scheduled',
  },
};

/* Text sits directly on the card surface; these all clear 4.5:1 there. */
const STATUS_COLORS: Record<VGPStatus, { text: string }> = {
  overdue:   { text: '#991b1b' },
  upcoming:  { text: '#8a4b03' },
  compliant: { text: '#036143' },
  unknown:   { text: '#4b5563' },
};

/**
 * Per-status glyph. Replaces the former colour-only dot: under deuteranopia the
 * red and amber dots were indistinguishable, which WCAG 1.4.1 prohibits.
 * Strokes are drawn on a 16px grid so they stay crisp at badge size.
 */
function StatusGlyph({ status, className }: { status: VGPStatus; className?: string }) {
  const common = {
    viewBox: '0 0 16 16',
    className,
    fill: 'none' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
  };
  if (status === 'overdue') {
    return (
      <svg {...common}>
        <path d="M8 2.4 1.9 13.1h12.2L8 2.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8 6.4v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="11.3" r=".95" fill="currentColor" />
      </svg>
    );
  }
  if (status === 'upcoming') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5.9" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 4.6V8l2.3 1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'compliant') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5.9" stroke="currentColor" strokeWidth="1.6" />
        <path d="m5.4 8.2 1.9 1.9 3.4-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

interface VGPStatusBadgeProps {
  status: VGPStatus;
  /** "sm" for table rows (default), "lg" for detail page hero badge */
  size?: 'sm' | 'lg';
  /** Override language (defaults to context) */
  language?: 'fr' | 'en';
}

/**
 * Color-coded VGP compliance badge.
 * Red = overdue, Amber = upcoming ≤30d, Green = compliant, Gray = not scheduled.
 * Chef de parc can scan a list and spot red instantly.
 */
export function VGPStatusBadge({ status, size = 'sm', language: languageProp }: VGPStatusBadgeProps) {
  const { language: contextLanguage } = useLanguage();
  const language = languageProp || contextLanguage;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.unknown;
  const label = language === 'fr' ? cfg.labelFr : cfg.labelEn;

  if (size === 'lg') {
    return (
      <span
        className="inline-flex items-center gap-2 text-base font-bold tracking-wide"
        style={{ color: colors.text }}
        role="status"
        aria-label={`VGP status: ${label}`}
      >
        <StatusGlyph status={status} className="w-[18px] h-[18px] flex-shrink-0" />
        {label}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[14px] font-semibold"
      style={{ color: colors.text }}
      role="status"
      aria-label={`VGP status: ${label}`}
    >
      <StatusGlyph status={status} className="w-4 h-4 flex-shrink-0" />
      {label}
    </span>
  );
}

/**
 * Urgency countdown pill, replaces text-xs "dans 5j" in VGPDashboard.
 * Red ≤7d, Amber ≤14d, Gray otherwise.
 */
export function VGPCountdownPill({ daysUntil }: { daysUntil: number }) {
  const colorStyle =
    daysUntil <= 0
      ? { backgroundColor: 'var(--status-retard, #dc2626)', color: '#ffffff' }
      : daysUntil <= 14
      ? { backgroundColor: '#fef3c7', color: '#92400e' }
      : { backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-muted, #777)' };

  return (
    <span
      className="inline-flex items-center justify-center min-w-[52px] px-3 py-1.5 rounded-lg text-[15px] tabular-nums font-medium"
      style={colorStyle}
      aria-label={`${daysUntil} days`}
    >
      {daysUntil}j
    </span>
  );
}
