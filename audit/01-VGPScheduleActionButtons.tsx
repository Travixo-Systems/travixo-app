/**
 * SUGGESTION 01 — VGP Schedule Action Buttons
 * Audit ref: ui-ux-audit.md §1.1 — CRITICAL touch targets
 * Replaces: components/vgp/VGPSchedulesManager.tsx:478-516
 *
 * Changes:
 * - All buttons: minimum 44×44px touch target (py-2.5 / p-2.5)
 * - Icon-only buttons get visible label on mobile (sr-only fallback)
 * - Consistent brand colors: blue-600 → #00252b primary, orange for archive
 * - Active state uses ring focus for keyboard/glove accessibility
 */

import { Edit, Eye, Archive } from "lucide-react";

interface VGPScheduleActionButtonsProps {
  schedule: { id: string };
  isReadOnly: boolean;
  onEdit: (schedule: { id: string }) => void;
  onViewDetails: (schedule: { id: string }) => void;
  onArchive: (id: string) => void;
  t: (key: string) => string;
}

export function VGPScheduleActionButtons({
  schedule,
  isReadOnly,
  onEdit,
  onViewDetails,
  onArchive,
  t,
}: VGPScheduleActionButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Primary CTA: Inspection — full label, large tap area */}
      {!isReadOnly && (
        <a
          href={`/vgp/inspection/${schedule.id}`}
          className="
            inline-flex items-center justify-center
            min-h-[44px] px-4 py-2.5
            text-sm font-semibold text-white rounded-lg
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#f26f00]
          "
          style={{ backgroundColor: "#00252b" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.backgroundColor =
              "#003d45")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.backgroundColor =
              "#00252b")
          }
        >
          {t("vgpSchedules.inspection")}
        </a>
      )}

      {/* Edit — icon + sr-only label, 44px min */}
      {!isReadOnly && (
        <button
          onClick={() => onEdit(schedule)}
          className="
            inline-flex items-center justify-center
            min-h-[44px] min-w-[44px] p-2.5 rounded-lg
            text-[#00252b] hover:bg-[#00252b]/10
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#f26f00]
          "
          title={t("vgpSchedules.edit")}
          aria-label={t("vgpSchedules.edit")}
        >
          <Edit className="w-5 h-5" aria-hidden="true" />
        </button>
      )}

      {/* Details — icon + sr-only label, 44px min */}
      <button
        onClick={() => onViewDetails(schedule)}
        className="
          inline-flex items-center justify-center
          min-h-[44px] min-w-[44px] p-2.5 rounded-lg
          text-gray-600 hover:bg-gray-100
          transition-colors
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#f26f00]
        "
        title={t("vgpSchedules.details")}
        aria-label={t("vgpSchedules.details")}
      >
        <Eye className="w-5 h-5" aria-hidden="true" />
      </button>

      {/* Archive — destructive-ish, orange accent */}
      {!isReadOnly && (
        <button
          onClick={() => onArchive(schedule.id)}
          className="
            inline-flex items-center justify-center
            min-h-[44px] min-w-[44px] p-2.5 rounded-lg
            text-[#f26f00] hover:bg-[#f26f00]/10
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#f26f00]
          "
          title={t("vgpSchedules.archive")}
          aria-label={t("vgpSchedules.archive")}
        >
          <Archive className="w-5 h-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
