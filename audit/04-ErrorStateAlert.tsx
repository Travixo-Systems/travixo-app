/**
 * SUGGESTION 04 — Reusable Error State + Empty State components
 * Audit ref: ui-ux-audit.md §4.1, §4.2 — MEDIUM silent failures
 * Replaces: silent catch blocks in audits/page.tsx:192, VGPSchedulesManager.tsx:190
 *
 * Pattern:
 *   const [error, setError] = useState<string | null>(null);
 *   ...
 *   catch (e) { setError(e.message || t('common.errorUnknown')); }
 *   ...
 *   if (error) return <ErrorStateAlert message={error} onRetry={refetch} />;
 */

import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";

interface ErrorStateAlertProps {
  /** Human-readable error message (already translated) */
  message: string;
  /** Called when user taps "Réessayer" */
  onRetry?: () => void;
  /** Optional contextual title */
  title?: string;
}

/**
 * Full-page error state — use when the whole page fails to load
 */
export function ErrorStatePage({
  message,
  onRetry,
  title = "Impossible de charger les données",
}: ErrorStateAlertProps) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[40vh] px-6 py-12 text-center"
      role="alert"
      aria-live="assertive"
    >
      {/* Icon */}
      <div className="mb-4 p-4 bg-red-50 rounded-full">
        <WifiOff className="w-10 h-10 text-red-500" aria-hidden="true" />
      </div>

      {/* Title */}
      <h2 className="text-lg font-bold text-gray-900 mb-2">{title}</h2>

      {/* Message */}
      <p className="text-sm text-gray-600 mb-6 max-w-xs">{message}</p>

      {/* Retry CTA — large touch target */}
      {onRetry && (
        <button
          onClick={onRetry}
          className="
            inline-flex items-center gap-2
            min-h-[44px] px-6 py-2.5
            text-sm font-semibold text-white rounded-lg
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26f00]
          "
          style={{ backgroundColor: "#00252b" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#003d45")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#00252b")
          }
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Réessayer
        </button>
      )}
    </div>
  );
}

/**
 * Inline error banner — use inside a section that partially fails
 */
export function ErrorStateBanner({
  message,
  onRetry,
  title = "Erreur de chargement",
}: ErrorStateAlertProps) {
  return (
    <div
      className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg"
      role="alert"
      aria-live="polite"
    >
      <AlertTriangle
        className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-800">{title}</p>
        <p className="text-sm text-red-700 mt-0.5">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="
            inline-flex items-center gap-1.5
            min-h-[36px] px-3 py-1.5 flex-shrink-0
            text-xs font-semibold text-red-700
            bg-white border border-red-300 rounded-lg
            hover:bg-red-50 transition-colors
            focus:outline-none focus:ring-2 focus:ring-red-400
          "
          aria-label="Réessayer le chargement"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Réessayer
        </button>
      )}
    </div>
  );
}

/**
 * Empty state — use when data loaded successfully but list is empty
 * (prevents confusing "blank page = error" UX)
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 px-6 text-center"
      role="status"
      aria-label={title}
    >
      <div className="mb-4 w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
        <span className="text-3xl" aria-hidden="true">📋</span>
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 mb-6 max-w-xs">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="
            inline-flex items-center justify-center
            min-h-[44px] px-5 py-2.5
            text-sm font-semibold text-white rounded-lg
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26f00]
          "
          style={{ backgroundColor: "#f26f00" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Usage example for audits/page.tsx
 *
 * Before:
 *   catch(e) { } // silent
 *   if (loading) return <Spinner />
 *   return <AuditList />
 *
 * After:
 *   const [error, setError] = useState<string | null>(null);
 *   catch(e) { setError(e.message || 'Erreur inconnue'); }
 *   if (error) return <ErrorStatePage message={error} onRetry={fetchAudits} />;
 *   if (!loading && audits.length === 0) return <EmptyState title="Aucun audit" description="Créez votre premier audit" />;
 *   return <AuditList />
 */
