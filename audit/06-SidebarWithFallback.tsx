/**
 * SUGGESTION 06 — Sidebar with Logo Fallback + Mobile Language Toggle
 * Audit ref: ui-ux-audit.md §7 (LOW logo fallback), §8 (MEDIUM mobile language)
 * Replaces: components/Sidebar.tsx:140-195 (logo section) + LanguageToggle placement
 *
 * Changes vs current:
 * 1. When collapsed + no logo → shows org initials in branded pill (not blank)
 * 2. Language toggle appears in sidebar footer on desktop AND in a sticky
 *    bottom bar on mobile (not hidden behind collapsed sidebar)
 * 3. Toggle collapse button: 44px min touch target
 */

"use client";

import Image from "next/image";
import { Bars3Icon, ChevronLeftIcon } from "@heroicons/react/24/outline";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarHeaderProps {
  collapsed: boolean;
  logo?: string | null;
  orgName: string;
  colors: { primary: string; secondary: string };
  onToggle: () => void;
  /** Current language code, e.g. "fr" | "en" */
  language: string;
  onLanguageChange: (lang: string) => void;
}

/**
 * Sidebar header section — logo + collapse toggle
 * Replaces Sidebar.tsx:140-195
 */
export function SidebarHeader({
  collapsed,
  logo,
  orgName,
  colors,
  onToggle,
}: Omit<SidebarHeaderProps, "language" | "onLanguageChange">) {
  // Derive initials from org name (max 2 chars)
  const initials = orgName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="flex items-center justify-between h-16 px-3 border-b border-gray-800 flex-shrink-0"
      style={{ backgroundColor: colors.primary }}
    >
      {/* Expanded: logo (or initials) + org name */}
      {!collapsed && (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {logo ? (
            <Image
              src={logo}
              alt={orgName}
              width={32}
              height={32}
              className="w-8 h-8 object-contain rounded flex-shrink-0"
            />
          ) : (
            // Fallback: initials pill in orange
            <span
              className="
                inline-flex items-center justify-center
                w-8 h-8 rounded-lg flex-shrink-0
                text-white text-xs font-bold tracking-wide
              "
              style={{ backgroundColor: "#f26f00" }}
              aria-hidden="true"
            >
              {initials}
            </span>
          )}
          <h1
            className="text-lg font-bold text-white truncate"
            title={orgName}
          >
            {orgName}
          </h1>
        </div>
      )}

      {/* Collapsed: logo OR initials pill, centered */}
      {collapsed && (
        <div className="flex-1 flex justify-center">
          {logo ? (
            <Image
              src={logo}
              alt={orgName}
              width={32}
              height={32}
              className="w-8 h-8 object-contain rounded"
            />
          ) : (
            <span
              className="
                inline-flex items-center justify-center
                w-8 h-8 rounded-lg
                text-white text-xs font-bold
              "
              style={{ backgroundColor: "#f26f00" }}
              aria-label={orgName}
            >
              {initials}
            </span>
          )}
        </div>
      )}

      {/* Toggle button — always 44px */}
      <button
        onClick={onToggle}
        className="
          inline-flex items-center justify-center
          min-h-[44px] min-w-[44px] p-2.5 rounded-lg flex-shrink-0
          text-gray-400 hover:text-white hover:bg-gray-800
          transition-colors
          focus:outline-none focus:ring-2 focus:ring-[#f26f00]
        "
        aria-label={collapsed ? "Agrandir la barre latérale" : "Réduire la barre latérale"}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <Bars3Icon className="w-5 h-5" />
        ) : (
          <ChevronLeftIcon className="w-5 h-5" />
        )}
      </button>
    </div>
  );
}

/**
 * Language toggle — desktop version (in sidebar footer)
 * Shows full labels when expanded, flag when collapsed
 */
export function SidebarLanguageToggle({
  collapsed,
  language,
  onLanguageChange,
  colors,
}: {
  collapsed: boolean;
  language: string;
  onLanguageChange: (lang: string) => void;
  colors: { primary: string };
}) {
  const isFr = language === "fr";

  return (
    <div
      className={cn(
        "flex items-center border-t border-gray-800 flex-shrink-0",
        collapsed ? "justify-center p-2" : "px-3 py-2"
      )}
      style={{ backgroundColor: colors.primary }}
    >
      <button
        onClick={() => onLanguageChange(isFr ? "en" : "fr")}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg transition-colors",
          "text-gray-400 hover:text-white hover:bg-gray-800",
          "focus:outline-none focus:ring-2 focus:ring-[#f26f00]",
          collapsed
            ? "min-h-[44px] min-w-[44px] justify-center p-2.5"
            : "min-h-[44px] w-full px-3 py-2.5 text-sm font-medium"
        )}
        aria-label={`Changer la langue vers ${isFr ? "English" : "Français"}`}
        title={`Changer vers ${isFr ? "English" : "Français"}`}
      >
        <Languages className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        {!collapsed && (
          <span>{isFr ? "English" : "Français"}</span>
        )}
      </button>
    </div>
  );
}

/**
 * Mobile-only language toggle bar — sticky bottom, always visible
 * Replaces the hidden-on-mobile language toggle problem (§8)
 *
 * Add this OUTSIDE the sidebar, at the bottom of the layout:
 *   <MobileLanguageBar language={language} onLanguageChange={setLanguage} />
 */
export function MobileLanguageBar({
  language,
  onLanguageChange,
}: {
  language: string;
  onLanguageChange: (lang: string) => void;
}) {
  const isFr = language === "fr";

  return (
    <div
      className="
        md:hidden
        fixed bottom-0 left-0 right-0 z-50
        flex items-center justify-end
        px-4 py-2
        bg-white border-t border-gray-200 shadow-lg
      "
    >
      <button
        onClick={() => onLanguageChange(isFr ? "en" : "fr")}
        className="
          inline-flex items-center gap-2
          min-h-[44px] px-4 py-2.5 rounded-lg
          text-sm font-medium text-gray-700
          border border-gray-200 bg-white
          hover:bg-gray-50 transition-colors
          focus:outline-none focus:ring-2 focus:ring-[#f26f00]
        "
        aria-label={`Langue actuelle : ${isFr ? "Français" : "English"}. Basculer vers ${isFr ? "English" : "Français"}`}
      >
        <Languages className="w-4 h-4" aria-hidden="true" />
        {isFr ? "EN" : "FR"}
      </button>
    </div>
  );
}
