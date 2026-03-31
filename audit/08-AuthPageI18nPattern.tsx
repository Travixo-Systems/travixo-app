/**
 * SUGGESTION 08 — Auth Page i18n Pattern
 * Audit ref: ui-ux-audit.md §2.1 — HIGH hardcoded bilingual strings
 * Replaces: app/(auth)/login/page.tsx:223-313 (hardcoded FR/EN strings)
 *
 * Problem: Auth pages use hardcoded "Adresse email / Email address" style
 * strings instead of the next-intl translation system.
 *
 * This file shows:
 * 1. Translation keys to add to messages/fr.json + messages/en.json
 * 2. A refactored LoginForm component using useTranslations()
 * 3. Pattern applicable to signup/page.tsx and forgot-password/page.tsx
 */

// ─── 1. Translation keys (add to messages/fr.json) ─────────────────────────
//
// "auth": {
//   "emailLabel": "Adresse email",
//   "emailPlaceholder": "vous@entreprise.fr",
//   "passwordLabel": "Mot de passe",
//   "passwordPlaceholder": "••••••••",
//   "rememberMe": "Se souvenir de moi",
//   "forgotPassword": "Mot de passe oublié ?",
//   "signingIn": "Connexion...",
//   "signIn": "Se connecter",
//   "noAccount": "Pas encore de compte ?",
//   "freeTrial": "Essai gratuit 15 jours",
//   "featureTeam": "Invitations & gestion d'équipe",
//   "featureAudit": "Audits d'inventaire digitaux",
//   "featureVgp": "Conformité VGP & DIRECCTE",
//   "errorEmail": "L'adresse email est requise",
//   "errorPassword": "Le mot de passe est requis",
//   "errorInvalidCredentials": "Email ou mot de passe incorrect",
//   "errorUnknown": "Une erreur est survenue. Réessayez."
// }
//
// Add equivalent English keys to messages/en.json:
// "auth": {
//   "emailLabel": "Email address",
//   "emailPlaceholder": "you@company.com",
//   "passwordLabel": "Password",
//   ...
// }

// ─── 2. Refactored LoginForm using useTranslations() ───────────────────────

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { FormInput, FormButton } from "./05-FormInputBranded";

interface LoginFormProps {
  onSubmit: (email: string, password: string, remember: boolean) => Promise<void>;
  isLoading: boolean;
  error?: string | null;
}

/**
 * Refactored login form — all strings via t() instead of hardcoded bilingual.
 * Drop-in replacement for the form section in app/(auth)/login/page.tsx
 */
export function LoginForm({ onSubmit, isLoading, error }: LoginFormProps) {
  const t = useTranslations("auth");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  // Client-side validation before API call
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  function validate(): boolean {
    const errors: typeof fieldErrors = {};
    if (!email.trim()) errors.email = t("errorEmail");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = t("errorEmailInvalid");
    if (!password) errors.password = t("errorPassword");
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(email, password, remember);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Server-level error (wrong credentials, etc.) */}
      {error && (
        <div
          className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      {/* Email */}
      <FormInput
        type="email"
        name="email"
        label={t("emailLabel")}
        placeholder={t("emailPlaceholder")}
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email}
        required
      />

      {/* Password */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor="login-password"
            className="text-sm font-medium text-gray-700"
          >
            {t("passwordLabel")}
            <span className="text-[#f26f00] ml-0.5" aria-hidden="true">*</span>
          </label>
          <Link
            href="/forgot-password"
            className="
              text-xs text-[#f26f00] hover:text-[#d85e00]
              underline-offset-2 hover:underline
              focus:outline-none focus:ring-1 focus:ring-[#f26f00] rounded
            "
          >
            {t("forgotPassword")}
          </Link>
        </div>
        <FormInput
          id="login-password"
          type="password"
          name="password"
          placeholder={t("passwordPlaceholder")}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
        />
      </div>

      {/* Remember me — large touch target */}
      <label className="flex items-center gap-3 cursor-pointer group min-h-[44px]">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="
            w-5 h-5 rounded border-gray-300
            accent-[#f26f00]
            focus:ring-2 focus:ring-[#f26f00] focus:ring-offset-1
          "
        />
        <span className="text-sm text-gray-700 group-hover:text-gray-900">
          {t("rememberMe")}
        </span>
      </label>

      {/* Submit */}
      <FormButton
        type="submit"
        variant="primary"
        fullWidth
        loading={isLoading}
        loadingLabel={t("signingIn")}
      >
        {t("signIn")}
      </FormButton>

      {/* Sign up link */}
      <p className="text-center text-sm text-gray-600">
        {t("noAccount")}{" "}
        <Link
          href="/signup"
          className="
            font-semibold text-[#f26f00] hover:text-[#d85e00]
            underline-offset-2 hover:underline
            focus:outline-none focus:ring-1 focus:ring-[#f26f00] rounded
          "
        >
          {t("freeTrial")}
        </Link>
      </p>
    </form>
  );
}

// ─── 3. Pattern for clients/page.tsx error messages (§2.2) ──────────────────
//
// Current (hardcoded):
//   setFormError(language === 'fr' ? 'Le nom est requis' : 'Name is required')
//
// Replace with:
//   const t = useTranslations('clients');
//   setFormError(t('errorNameRequired'));
//
// Add to messages/fr.json:
//   "clients": {
//     "errorNameRequired": "Le nom est requis",
//     "errorConnection": "Erreur de connexion"
//   }
//
// Add to messages/en.json:
//   "clients": {
//     "errorNameRequired": "Name is required",
//     "errorConnection": "Connection error"
//   }
