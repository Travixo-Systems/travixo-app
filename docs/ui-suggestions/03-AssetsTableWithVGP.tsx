/**
 * SUGGESTION 03 — Assets Table with VGP Column + Larger Touch Targets
 * Audit ref: ui-ux-audit.md §1.1 (CRITICAL), §3.2 (HIGH)
 * Replaces: components/assets/AssetsTableClient.tsx (full table)
 *
 * Key changes vs current:
 * 1. Added VGP status column between Status and Location
 * 2. All action icon-buttons: min 44×44px (p-2.5 instead of p-1.5/p-1)
 * 3. Category badge: min-height 28px so easier to tap (not interactive, just readable)
 * 4. Status badge consistent brand colors
 * 5. Sticky column headers on mobile horizontal scroll
 */

import { Shield, QrCode, Edit3, Trash2 } from "lucide-react";
import { VGPStatusBadge } from "./02-VGPStatusBadge";

type VGPStatus = "overdue" | "upcoming" | "compliant" | "unknown";

interface Asset {
  id: string;
  name: string;
  serial_number?: string;
  status: string;
  current_location?: string;
  asset_categories?: { name: string; color?: string };
  vgp_status?: VGPStatus | null;
}

interface AssetsTableWithVGPProps {
  assets: Asset[];
  onVgp: (asset: Asset) => void;
  onQr: (asset: Asset) => void;
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  t: (key: string) => string;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "available":    return "bg-green-100 text-green-800";
    case "in_use":       return "bg-blue-100 text-blue-800";
    case "maintenance":  return "bg-yellow-100 text-yellow-800";
    case "retired":      return "bg-gray-100 text-gray-800";
    default:             return "bg-gray-100 text-gray-800";
  }
}

function getStatusLabel(status: string, t: (k: string) => string): string {
  return t(`assets.status.${status}`) ?? status;
}

export function AssetsTableWithVGP({
  assets,
  onVgp,
  onQr,
  onEdit,
  onDelete,
  t,
}: AssetsTableWithVGPProps) {
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      {/* Horizontal scroll on mobile */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("assets.tableHeaderName")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("assets.tableHeaderSerial")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("assets.tableHeaderCategory")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("assets.tableHeaderStatus")}
              </th>
              {/* NEW: VGP column — the most important for chef de parc */}
              <th
                className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                style={{ color: "#00252b" }}
                aria-label="Statut VGP"
              >
                VGP
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("assets.tableHeaderLocation")}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("assets.tableHeaderActions")}
              </th>
            </tr>
          </thead>

          <tbody className="bg-white divide-y divide-gray-200">
            {assets.map((asset) => (
              <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                {/* Name */}
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                  {asset.name}
                </td>

                {/* Serial */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                  {asset.serial_number || "—"}
                </td>

                {/* Category */}
                <td className="px-6 py-4 whitespace-nowrap">
                  {asset.asset_categories?.name ? (
                    <span
                      className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold text-white"
                      style={{
                        backgroundColor:
                          asset.asset_categories.color ?? "#6B7280",
                      }}
                    >
                      {asset.asset_categories.name}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </td>

                {/* Asset status */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(asset.status)}`}
                  >
                    {getStatusLabel(asset.status, t)}
                  </span>
                </td>

                {/* VGP status — NEW, bold visual */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <VGPStatusBadge status={asset.vgp_status ?? "unknown"} />
                </td>

                {/* Location */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {asset.current_location || "—"}
                </td>

                {/* Actions — all 44×44px minimum */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex justify-end items-center gap-1">
                    {/* VGP */}
                    <button
                      onClick={() => onVgp(asset)}
                      className="
                        inline-flex items-center justify-center
                        min-h-[44px] min-w-[44px] p-2.5 rounded-lg
                        text-[#00252b] hover:bg-[#00252b]/10
                        transition-colors
                        focus:outline-none focus:ring-2 focus:ring-[#f26f00]
                      "
                      title={t("assets.tooltipAddVgp")}
                      aria-label={t("assets.tooltipAddVgp")}
                    >
                      <Shield className="w-5 h-5" aria-hidden="true" />
                    </button>

                    {/* QR */}
                    <button
                      onClick={() => onQr(asset)}
                      className="
                        inline-flex items-center justify-center
                        min-h-[44px] min-w-[44px] p-2.5 rounded-lg
                        text-indigo-600 hover:bg-indigo-50
                        transition-colors
                        focus:outline-none focus:ring-2 focus:ring-[#f26f00]
                      "
                      title={t("assets.tooltipQr")}
                      aria-label={t("assets.tooltipQr")}
                    >
                      <QrCode className="w-5 h-5" aria-hidden="true" />
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => onEdit(asset)}
                      className="
                        inline-flex items-center justify-center
                        min-h-[44px] min-w-[44px] p-2.5 rounded-lg
                        text-gray-600 hover:bg-gray-100
                        transition-colors
                        focus:outline-none focus:ring-2 focus:ring-[#f26f00]
                      "
                      title={t("assets.tooltipEdit")}
                      aria-label={t("assets.tooltipEdit")}
                    >
                      <Edit3 className="w-5 h-5" aria-hidden="true" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => onDelete(asset)}
                      className="
                        inline-flex items-center justify-center
                        min-h-[44px] min-w-[44px] p-2.5 rounded-lg
                        text-red-500 hover:bg-red-50
                        transition-colors
                        focus:outline-none focus:ring-2 focus:ring-red-400
                      "
                      title={t("assets.tooltipDelete")}
                      aria-label={t("assets.tooltipDelete")}
                    >
                      <Trash2 className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {assets.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-12 text-center text-sm text-gray-500"
                >
                  {t("assets.noAssets") ?? "Aucun équipement trouvé"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
