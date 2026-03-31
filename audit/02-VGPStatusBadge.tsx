/**
 * SUGGESTION 02 — VGP Status Badge (inline + standalone)
 * Audit ref: ui-ux-audit.md §3.1, §3.2, §3.3 — HIGH VGP visibility
 *
 * Usage A — Inspection detail page header (replaces §3.1 gap):
 *   <VGPStatusBadge status={deriveStatus(schedule.next_due_date)} size="lg" />
 *
 * Usage B — Assets table column (§3.2):
 *   <VGPStatusBadge status={asset.vgp_status} />
 *
 * Usage C — VGP dashboard upcoming row countdown (§3.3):
 *   <VGPCountdownPill daysUntil={daysUntil} />
 *
 * Design:
 * - Color-coded at a glance: red (overdue), yellow (upcoming ≤30d), green (ok)
 * - Large enough to read on mobile in sunlight
 * - Chef de parc can scan down a list and spot red instantly
 */

type VGPStatus = "overdue" | "upcoming" | "compliant" | "unknown";

interface VGPStatusBadgeProps {
  status: VGPStatus;
  /** "sm" for table rows, "lg" for detail page hero */
  size?: "sm" | "lg";
  /** Override label (uses French defaults) */
  label?: string;
}

const STATUS_CONFIG: Record<
  VGPStatus,
  { bg: string; text: string; border: string; defaultLabel: string; dot: string }
> = {
  overdue: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-300",
    dot: "bg-red-500",
    defaultLabel: "En retard",
  },
  upcoming: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-300",
    dot: "bg-amber-500",
    defaultLabel: "À venir",
  },
  compliant: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-300",
    dot: "bg-emerald-500",
    defaultLabel: "Conforme",
  },
  unknown: {
    bg: "bg-gray-50",
    text: "text-gray-600",
    border: "border-gray-200",
    dot: "bg-gray-400",
    defaultLabel: "Non planifié",
  },
};

export function VGPStatusBadge({
  status,
  size = "sm",
  label,
}: VGPStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const displayLabel = label ?? cfg.defaultLabel;

  if (size === "lg") {
    // Hero badge for inspection detail page — very readable at arm's length
    return (
      <span
        className={`
          inline-flex items-center gap-2
          px-4 py-2 rounded-full border
          text-base font-bold tracking-wide
          ${cfg.bg} ${cfg.text} ${cfg.border}
        `}
        role="status"
        aria-label={`Statut VGP: ${displayLabel}`}
      >
        <span
          className={`w-3 h-3 rounded-full flex-shrink-0 ${cfg.dot}`}
          aria-hidden="true"
        />
        {displayLabel}
      </span>
    );
  }

  // Compact badge for table rows — still 28px+ height so tap-friendly adjacent
  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        px-2.5 py-1 rounded-full border
        text-xs font-semibold
        ${cfg.bg} ${cfg.text} ${cfg.border}
      `}
      role="status"
      aria-label={`Statut VGP: ${displayLabel}`}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`}
        aria-hidden="true"
      />
      {displayLabel}
    </span>
  );
}

/**
 * VGP Countdown Pill
 * Replaces: components/vgp/VGPDashboard.tsx:238
 * Renders "dans 5j" with urgency color coding.
 */
interface VGPCountdownPillProps {
  daysUntil: number;
}

export function VGPCountdownPill({ daysUntil }: VGPCountdownPillProps) {
  const isUrgent = daysUntil <= 7;
  const isWarning = daysUntil <= 14;

  const colorClass = isUrgent
    ? "bg-red-100 text-red-700 font-bold"
    : isWarning
    ? "bg-amber-100 text-amber-700 font-semibold"
    : "bg-gray-100 text-gray-700 font-medium";

  return (
    <span
      className={`
        inline-flex items-center justify-center
        min-w-[56px] px-3 py-1.5 rounded-lg
        text-sm tabular-nums
        ${colorClass}
      `}
      aria-label={`Dans ${daysUntil} jours`}
    >
      {daysUntil}j
    </span>
  );
}

/**
 * VGP Status column header cell (for AssetsTableClient)
 * Drop-in <th> replacement
 */
export function VGPStatusTableHeader({ t }: { t: (k: string) => string }) {
  return (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
      aria-label="Statut VGP"
    >
      {t("assets.vgpStatus") ?? "VGP"}
    </th>
  );
}

/**
 * VGP Status column body cell (for AssetsTableClient)
 * Drop-in <td> replacement
 */
export function VGPStatusTableCell({
  vgpStatus,
}: {
  vgpStatus?: VGPStatus | null;
}) {
  if (!vgpStatus) {
    return (
      <td className="px-6 py-4 whitespace-nowrap">
        <VGPStatusBadge status="unknown" />
      </td>
    );
  }
  return (
    <td className="px-6 py-4 whitespace-nowrap">
      <VGPStatusBadge status={vgpStatus} />
    </td>
  );
}
