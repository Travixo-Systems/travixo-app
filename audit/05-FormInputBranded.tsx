/**
 * SUGGESTION 05 — Branded Form Input + Textarea + Select
 * Audit ref: ui-ux-audit.md §6.1 — MEDIUM focus ring inconsistency
 * Replaces: ad-hoc focus:ring-indigo-500 / focus:ring-orange-500 across:
 *   - components/assets/AddAssetModal.tsx:146
 *   - components/assets/AssetsPageClient.tsx:217
 *   - app/(auth)/signup/page.tsx:285
 *
 * All inputs use:
 *   focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00]
 * which matches brand orange and meets WCAG 3:1 contrast on white.
 *
 * Touch target: min-h-[44px] on all inputs (required for mobile/gloves).
 */

import React from "react";

type BaseInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

/**
 * Drop-in branded <input> — replaces all scattered <input className="...focus:ring-indigo-500..." />
 */
export const FormInput = React.forwardRef<HTMLInputElement, BaseInputProps>(
  ({ label, error, hint, id, className = "", ...props }, ref) => {
    const inputId = id ?? `input-${props.name}`;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-gray-700"
          >
            {label}
            {props.required && (
              <span className="text-[#f26f00] ml-0.5" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <input
          ref={ref}
          id={inputId}
          className={`
            block w-full
            min-h-[44px] px-3 py-2.5
            text-sm text-gray-900
            bg-white border border-gray-300 rounded-lg
            placeholder:text-gray-400
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00]
            disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
            ${error ? "border-red-400 focus:ring-red-400 focus:border-red-400" : ""}
            ${className}
          `}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          {...props}
        />

        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-gray-500">
            {hint}
          </p>
        )}

        {error && (
          <p
            id={`${inputId}-error`}
            className="text-xs text-red-600 font-medium"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);
FormInput.displayName = "FormInput";

/**
 * Drop-in branded <textarea>
 */
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export const FormTextarea = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(({ label, error, hint, id, className = "", ...props }, ref) => {
  const inputId = id ?? `textarea-${props.name}`;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
          {props.required && (
            <span className="text-[#f26f00] ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <textarea
        ref={ref}
        id={inputId}
        className={`
          block w-full
          px-3 py-2.5
          text-sm text-gray-900
          bg-white border border-gray-300 rounded-lg
          placeholder:text-gray-400
          transition-colors
          focus:outline-none focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00]
          disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
          resize-y
          ${error ? "border-red-400 focus:ring-red-400" : ""}
          ${className}
        `}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        {...props}
      />

      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-gray-500">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${inputId}-error`}
          className="text-xs text-red-600 font-medium"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
});
FormTextarea.displayName = "FormTextarea";

/**
 * Drop-in branded <select>
 */
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export const FormSelect = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, id, className = "", children, ...props }, ref) => {
    const inputId = id ?? `select-${props.name}`;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-gray-700"
          >
            {label}
            {props.required && (
              <span className="text-[#f26f00] ml-0.5" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <select
          ref={ref}
          id={inputId}
          className={`
            block w-full
            min-h-[44px] px-3 py-2.5
            text-sm text-gray-900
            bg-white border border-gray-300 rounded-lg
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00]
            disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
            ${error ? "border-red-400 focus:ring-red-400" : ""}
            ${className}
          `}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        >
          {children}
        </select>

        {error && (
          <p
            id={`${inputId}-error`}
            className="text-xs text-red-600 font-medium"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);
FormSelect.displayName = "FormSelect";

/**
 * Primary action button — used in auth pages + forms
 * Replaces all ad-hoc orange/indigo submit buttons
 */
interface FormButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  fullWidth?: boolean;
}

export function FormButton({
  children,
  loading,
  loadingLabel = "Chargement...",
  variant = "primary",
  fullWidth = false,
  className = "",
  disabled,
  ...props
}: FormButtonProps) {
  const base = `
    inline-flex items-center justify-center gap-2
    min-h-[44px] px-5 py-2.5
    text-sm font-semibold rounded-lg
    transition-colors
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    ${fullWidth ? "w-full" : ""}
  `;

  const variants = {
    primary:   "bg-[#f26f00] hover:bg-[#d85e00] text-white focus:ring-[#f26f00]",
    secondary: "bg-[#00252b] hover:bg-[#003d45] text-white focus:ring-[#00252b]",
    danger:    "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500",
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className}`}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="w-4 h-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
