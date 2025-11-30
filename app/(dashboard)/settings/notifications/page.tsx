// app/(dashboard)/settings/notifications/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BellIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useLanguage } from '@/lib/LanguageContext';
import { useOrganization, useUpdateNotifications, type NotificationPreferences } from '@/hooks/useOrganization';
import toast from 'react-hot-toast';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  email_enabled: true,
  vgp_alerts: {
    enabled: true,
    timing: [30, 15, 7, 1],
    recipients: 'owner',
  },
  digest_mode: 'daily',
  asset_alerts: true,
  audit_alerts: true,
};

export default function NotificationsSettingsPage() {
  const { language } = useLanguage();
  const { data: organization, isLoading } = useOrganization();
  const { mutateAsync: updateNotifications, isPending: saving } = useUpdateNotifications();

  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    if (organization?.notification_preferences) {
      setPreferences(organization.notification_preferences);
    }
  }, [organization]);

  const labels = {
    pageTitle: { en: 'Notifications', fr: 'Notifications' },
    pageSubtitle: { en: 'Configure your notification preferences', fr: 'Configurez vos préférences de notifications' },
    back: { en: 'Back to Settings', fr: 'Retour aux Paramètres' },
    emailNotifications: { en: 'Email Notifications', fr: 'Notifications Email' },
    enableEmail: { en: 'Enable email notifications', fr: 'Activer les notifications email' },
    enableEmailHelp: { en: 'Receive emails for important alerts', fr: 'Recevoir des emails pour les alertes importantes' },
    vgpAlerts: { en: 'VGP Alerts', fr: 'Alertes VGP' },
    enableVgp: { en: 'Enable VGP alerts', fr: 'Activer les alertes VGP' },
    enableVgpHelp: { en: 'Receive reminders before inspection deadlines', fr: 'Recevoir des rappels avant les échéances' },
    alertTiming: { en: 'Alert Timing', fr: 'Timing des Alertes' },
    alertTimingHelp: { en: 'Days before deadline to receive alert', fr: 'Jours avant l\'échéance pour recevoir une alerte' },
    timing30: { en: '30 days before', fr: '30 jours avant' },
    timing15: { en: '15 days before', fr: '15 jours avant' },
    timing7: { en: '7 days before', fr: '7 jours avant' },
    timing1: { en: '1 day before', fr: '1 jour avant' },
    recipients: { en: 'Recipients', fr: 'Destinataires' },
    recipientsHelp: { en: 'Who should receive VGP alerts', fr: 'Qui doit recevoir les alertes VGP' },
    recipientOwner: { en: 'Owner only', fr: 'Propriétaire uniquement' },
    recipientAdmin: { en: 'Owner and admins', fr: 'Propriétaire et administrateurs' },
    recipientAll: { en: 'All team members', fr: 'Tous les membres' },
    digestMode: { en: 'Digest Mode', fr: 'Mode Résumé' },
    digestModeHelp: { en: 'Frequency of activity summary emails', fr: 'Fréquence des résumés d\'activité' },
    digestImmediate: { en: 'Immediate (each alert)', fr: 'Immédiat (chaque alerte)' },
    digestDaily: { en: 'Daily summary', fr: 'Résumé quotidien' },
    digestWeekly: { en: 'Weekly summary', fr: 'Résumé hebdomadaire' },
    digestNever: { en: 'Never', fr: 'Jamais' },
    otherAlerts: { en: 'Other Alerts', fr: 'Autres Alertes' },
    assetAlerts: { en: 'Asset alerts', fr: 'Alertes d\'équipements' },
    assetAlertsHelp: { en: 'Notifications for asset status changes', fr: 'Notifications pour les changements d\'état' },
    auditAlerts: { en: 'Audit alerts', fr: 'Alertes d\'audits' },
    auditAlertsHelp: { en: 'Notifications for scheduled and completed audits', fr: 'Notifications pour les audits' },
    save: { en: 'Save Preferences', fr: 'Enregistrer' },
    saving: { en: 'Saving...', fr: 'Enregistrement...' },
    reset: { en: 'Reset to Default', fr: 'Réinitialiser' },
    cancel: { en: 'Cancel', fr: 'Annuler' },
    saveSuccess: { en: 'Preferences saved', fr: 'Préférences enregistrées' },
    saveError: { en: 'Error saving preferences', fr: 'Erreur lors de l\'enregistrement' },
  };

  const toggleTiming = (days: number) => {
    setPreferences(prev => ({
      ...prev,
      vgp_alerts: {
        ...prev.vgp_alerts,
        timing: prev.vgp_alerts.timing.includes(days)
          ? prev.vgp_alerts.timing.filter(d => d !== days)
          : [...prev.vgp_alerts.timing, days].sort((a, b) => b - a),
      },
    }));
  };

  const resetToDefault = () => {
    setPreferences(DEFAULT_PREFERENCES);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateNotifications(preferences);
      toast.success(labels.saveSuccess[language]);
    } catch (error: any) {
      toast.error(error.message || labels.saveError[language]);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const emailDisabled = !preferences.email_enabled;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link
          href="/settings"
          className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          {labels.back[language]}
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <BellIcon className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                {labels.pageTitle[language]}
              </h1>
              <p className="text-sm text-gray-600">
                {labels.pageSubtitle[language]}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Notifications */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-900 mb-4">
              {labels.emailNotifications[language]}
            </h3>
            
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {labels.enableEmail[language]}
                </p>
                <p className="text-xs text-gray-500">
                  {labels.enableEmailHelp[language]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreferences(prev => ({ ...prev, email_enabled: !prev.email_enabled }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  preferences.email_enabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    preferences.email_enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* VGP Alerts */}
          <div className={`bg-white shadow rounded-lg p-6 ${emailDisabled ? 'opacity-50' : ''}`}>
            <h3 className="text-sm font-medium text-gray-900 mb-4">
              {labels.vgpAlerts[language]}
            </h3>
            
            {/* Enable VGP */}
            <label className="flex items-center justify-between cursor-pointer mb-6">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {labels.enableVgp[language]}
                </p>
                <p className="text-xs text-gray-500">
                  {labels.enableVgpHelp[language]}
                </p>
              </div>
              <button
                type="button"
                disabled={emailDisabled}
                onClick={() => setPreferences(prev => ({
                  ...prev,
                  vgp_alerts: { ...prev.vgp_alerts, enabled: !prev.vgp_alerts.enabled }
                }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  preferences.vgp_alerts.enabled && !emailDisabled ? 'bg-blue-600' : 'bg-gray-200'
                } ${emailDisabled ? 'cursor-not-allowed' : ''}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    preferences.vgp_alerts.enabled && !emailDisabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>

            {/* Alert Timing */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-1">
                {labels.alertTiming[language]}
              </p>
              <p className="text-xs text-gray-500 mb-3">
                {labels.alertTimingHelp[language]}
              </p>
              <div className="flex flex-wrap gap-2">
                {[30, 15, 7, 1].map(days => (
                  <button
                    key={days}
                    type="button"
                    disabled={emailDisabled || !preferences.vgp_alerts.enabled}
                    onClick={() => toggleTiming(days)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      preferences.vgp_alerts.timing.includes(days)
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    } ${emailDisabled || !preferences.vgp_alerts.enabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    {days === 30 && labels.timing30[language]}
                    {days === 15 && labels.timing15[language]}
                    {days === 7 && labels.timing7[language]}
                    {days === 1 && labels.timing1[language]}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipients */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">
                {labels.recipients[language]}
              </p>
              <p className="text-xs text-gray-500 mb-3">
                {labels.recipientsHelp[language]}
              </p>
              <div className="space-y-2">
                {[
                  { value: 'owner', label: labels.recipientOwner },
                  { value: 'admin', label: labels.recipientAdmin },
                  { value: 'all', label: labels.recipientAll },
                ].map(option => (
                  <label key={option.value} className="flex items-center">
                    <input
                      type="radio"
                      name="recipients"
                      value={option.value}
                      checked={preferences.vgp_alerts.recipients === option.value}
                      disabled={emailDisabled || !preferences.vgp_alerts.enabled}
                      onChange={(e) => setPreferences(prev => ({
                        ...prev,
                        vgp_alerts: { ...prev.vgp_alerts, recipients: e.target.value }
                      }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">{option.label[language]}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Digest Mode */}
          <div className={`bg-white shadow rounded-lg p-6 ${emailDisabled ? 'opacity-50' : ''}`}>
            <h3 className="text-sm font-medium text-gray-900 mb-1">
              {labels.digestMode[language]}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {labels.digestModeHelp[language]}
            </p>
            
            <div className="space-y-2">
              {[
                { value: 'immediate', label: labels.digestImmediate },
                { value: 'daily', label: labels.digestDaily },
                { value: 'weekly', label: labels.digestWeekly },
                { value: 'never', label: labels.digestNever },
              ].map(option => (
                <label key={option.value} className="flex items-center">
                  <input
                    type="radio"
                    name="digest_mode"
                    value={option.value}
                    checked={preferences.digest_mode === option.value}
                    disabled={emailDisabled}
                    onChange={(e) => setPreferences(prev => ({ ...prev, digest_mode: e.target.value }))}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="ml-2 text-sm text-gray-700">{option.label[language]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Other Alerts */}
          <div className={`bg-white shadow rounded-lg p-6 ${emailDisabled ? 'opacity-50' : ''}`}>
            <h3 className="text-sm font-medium text-gray-900 mb-4">
              {labels.otherAlerts[language]}
            </h3>
            
            <div className="space-y-4">
              {/* Asset Alerts */}
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {labels.assetAlerts[language]}
                  </p>
                  <p className="text-xs text-gray-500">
                    {labels.assetAlertsHelp[language]}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={emailDisabled}
                  onClick={() => setPreferences(prev => ({ ...prev, asset_alerts: !prev.asset_alerts }))}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    preferences.asset_alerts && !emailDisabled ? 'bg-blue-600' : 'bg-gray-200'
                  } ${emailDisabled ? 'cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      preferences.asset_alerts && !emailDisabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>

              {/* Audit Alerts */}
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {labels.auditAlerts[language]}
                  </p>
                  <p className="text-xs text-gray-500">
                    {labels.auditAlertsHelp[language]}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={emailDisabled}
                  onClick={() => setPreferences(prev => ({ ...prev, audit_alerts: !prev.audit_alerts }))}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    preferences.audit_alerts && !emailDisabled ? 'bg-blue-600' : 'bg-gray-200'
                  } ${emailDisabled ? 'cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      preferences.audit_alerts && !emailDisabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={resetToDefault}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {labels.reset[language]}
            </button>
            <div className="flex space-x-4">
              <Link
                href="/settings"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {labels.cancel[language]}
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? labels.saving[language] : labels.save[language]}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}