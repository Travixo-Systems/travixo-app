// components/vgp/VGPStatusBadge.tsx
// Audit fix: ui-ux-audit.md §3.1, §3.2, §3.3 — VGP status not visible at a glance
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

const STATUS_COLORS: Record<VGPStatus, { dot: string; text: string }> = {
  overdue:   { dot: '#dc2626', text: '#dc2626' },
  upcoming:  { dot: '#d97706', text: '#d97706' },
  compliant: { dot: '#059669', text: '#059669' },
  unknown:   { dot: '#6b7280', text: '#888888' },
};

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
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colors.dot }} aria-hidden="true" />
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
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colors.dot }} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Urgency countdown pill — replaces text-xs "dans 5j" in VGPDashboard.
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
