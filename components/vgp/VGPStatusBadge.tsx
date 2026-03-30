// components/vgp/VGPStatusBadge.tsx
// Audit fix: ui-ux-audit.md §3.1, §3.2, §3.3 — VGP status not visible at a glance

export type VGPStatus = 'overdue' | 'upcoming' | 'compliant' | 'unknown';

interface StatusConfig {
  bg: string;
  text: string;
  border: string;
  dot: string;
  labelFr: string;
  labelEn: string;
}

const STATUS_CONFIG: Record<VGPStatus, StatusConfig> = {
  overdue: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-300',
    dot: 'bg-red-500',
    labelFr: 'En retard',
    labelEn: 'Overdue',
  },
  upcoming: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-300',
    dot: 'bg-amber-500',
    labelFr: 'À venir',
    labelEn: 'Upcoming',
  },
  compliant: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    dot: 'bg-emerald-500',
    labelFr: 'Conforme',
    labelEn: 'Compliant',
  },
  unknown: {
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    border: 'border-gray-200',
    dot: 'bg-gray-400',
    labelFr: 'Non planifié',
    labelEn: 'Not scheduled',
  },
};

interface VGPStatusBadgeProps {
  status: VGPStatus;
  /** "sm" for table rows (default), "lg" for detail page hero badge */
  size?: 'sm' | 'lg';
  language?: 'fr' | 'en';
}

/**
 * Color-coded VGP compliance badge.
 * Red = overdue, Amber = upcoming ≤30d, Green = compliant, Gray = not scheduled.
 * Chef de parc can scan a list and spot red instantly.
 */
export function VGPStatusBadge({ status, size = 'sm', language = 'fr' }: VGPStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const label = language === 'fr' ? cfg.labelFr : cfg.labelEn;

  if (size === 'lg') {
    return (
      <span
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-base font-bold tracking-wide ${cfg.bg} ${cfg.text} ${cfg.border}`}
        role="status"
        aria-label={`Statut VGP : ${label}`}
      >
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${cfg.dot}`} aria-hidden="true" />
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}
      role="status"
      aria-label={`Statut VGP : ${label}`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Urgency countdown pill — replaces text-xs "dans 5j" in VGPDashboard.
 * Red ≤7d, Amber ≤14d, Gray otherwise.
 */
export function VGPCountdownPill({ daysUntil }: { daysUntil: number }) {
  const colorClass =
    daysUntil <= 7
      ? 'bg-red-100 text-red-700 font-bold'
      : daysUntil <= 14
      ? 'bg-amber-100 text-amber-700 font-semibold'
      : 'bg-gray-100 text-gray-700 font-medium';

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[52px] px-3 py-1.5 rounded-lg text-sm tabular-nums ${colorClass}`}
      aria-label={`Dans ${daysUntil} jours`}
    >
      {daysUntil}j
    </span>
  );
}
