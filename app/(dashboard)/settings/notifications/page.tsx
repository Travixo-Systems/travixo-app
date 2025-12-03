// app/(dashboard)/settings/notifications/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BellIcon,
  ArrowLeftIcon,
  PencilIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '@/lib/LanguageContext';
import { useOrganization, useUpdateNotifications, type NotificationPreferences } from '@/hooks/useOrganization';
import toast from 'react-hot-toast';

export default function NotificationsSettingsPage() {
  const { language } = useLanguage();
  const { data: organization, isLoading } = useOrganization();
  const { mutateAsync: updateNotifications, isPending: saving } = useUpdateNotifications();

  const [isEditing, setIsEditing] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email_enabled: true,
    vgp_alerts: {
      enabled: true,
      timing: [30, 15, 7, 1],
      recipients: 'owner',
    },
    digest_mode: 'daily',
    asset_alerts: true,
    audit_alerts: true,
  });

  useEffect(() => {
    if (organization?.notification_preferences) {
      setPreferences(organization.notification_preferences);
    }
  }, [organization]);

  const labels = {
    pageTitle: { en: 'Notifications', fr: 'Notifications' },
    pageSubtitle: { en: 'Manage email alerts and preferences', fr: 'Gérez les alertes email et préférences' },
    back: { en: 'Back to Settings', fr: 'Retour aux Paramètres' },
    edit: { en: 'Edit', fr: 'Modifier' },
    save: { en: 'Save Changes', fr: 'Enregistrer' },
    cancel: { en: 'Cancel', fr: 'Annuler' },
    saving: { en: 'Saving...', fr: 'Enregistrement...' },
    saveSuccess: { en: 'Notification preferences updated', fr: 'Préférences de notifications mises à jour' },
    saveError: { en: 'Error updating preferences', fr: 'Erreur lors de la mise à jour' },
    
    emailNotifications: { en: 'Email Notifications', fr: 'Notifications Email' },
    emailEnabled: { en: 'Enable email notifications', fr: 'Activer les notifications email' },
    
    vgpAlerts: { en: 'VGP Compliance Alerts', fr: 'Alertes de Conformité VGP' },
    vgpAlertsDesc: { en: 'Receive email alerts for upcoming inspections', fr: 'Recevez des alertes email pour les inspections à venir' },
    vgpEnabled: { en: 'Enable VGP alerts', fr: 'Activer les alertes VGP' },
    
    alertTiming: { en: 'Alert Timing', fr: 'Calendrier des Alertes' },
    alertTimingDesc: { en: 'Days before due date', fr: 'Jours avant l\'échéance' },
    daysInAdvance: { en: 'days in advance', fr: 'jours à l\'avance' },
    
    recipients: { en: 'Alert Recipients', fr: 'Destinataires des Alertes' },
    recipientsOwner: { en: 'Organization owner only', fr: 'Propriétaire uniquement' },
    recipientsAll: { en: 'All team members', fr: 'Tous les membres' },
    
    digestMode: { en: 'Digest Mode', fr: 'Mode Résumé' },
    digestModeDesc: { en: 'Frequency of summary emails', fr: 'Fréquence des emails récapitulatifs' },
    daily: { en: 'Daily (8:00 AM)', fr: 'Quotidien (8h00)' },
    weekly: { en: 'Weekly (Monday 8:00 AM)', fr: 'Hebdomadaire (Lundi 8h00)' },
    realtime: { en: 'Real-time (immediate)', fr: 'Temps réel (immédiat)' },
    
    otherAlerts: { en: 'Other Alerts', fr: 'Autres Alertes' },
    assetAlerts: { en: 'Asset movement alerts', fr: 'Alertes de mouvement d\'actifs' },
    auditAlerts: { en: 'Audit reminders', fr: 'Rappels d\'audit' },
    
    enabled: { en: 'Enabled', fr: 'Activé' },
    disabled: { en: 'Disabled', fr: 'Désactivé' },
    yes: { en: 'Yes', fr: 'Oui' },
    no: { en: 'No', fr: 'Non' },
  };

  const handleToggleVGPAlerts = () => {
    setPreferences(prev => ({
      ...prev,
      vgp_alerts: {
        ...prev.vgp_alerts,
        enabled: !prev.vgp_alerts.enabled,
      },
    }));
  };

  const handleToggleVGPTiming = (days: number) => {
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

  const handleChangeVGPRecipients = (recipients: string) => {
    setPreferences(prev => ({
      ...prev,
      vgp_alerts: {
        ...prev.vgp_alerts,
        recipients,
      },
    }));
  };

  const handleToggleEmail = () => {
    setPreferences(prev => ({ ...prev, email_enabled: !prev.email_enabled }));
  };

  const handleToggleAssetAlerts = () => {
    setPreferences(prev => ({ ...prev, asset_alerts: !prev.asset_alerts }));
  };

  const handleToggleAuditAlerts = () => {
    setPreferences(prev => ({ ...prev, audit_alerts: !prev.audit_alerts }));
  };

  const handleChangeDigestMode = (mode: string) => {
    setPreferences(prev => ({ ...prev, digest_mode: mode }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Hook expects NotificationPreferences directly, it wraps in { preferences: ... } internally
      await updateNotifications(preferences);
      toast.success(labels.saveSuccess[language]);
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error.message || labels.saveError[language]);
    }
  };

  const handleCancelEdit = () => {
    if (organization?.notification_preferences) {
      setPreferences(organization.notification_preferences);
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

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
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <BellIcon className="w-5 h-5 text-blue-600" />
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

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <PencilIcon className="w-4 h-4" />
              <span>{labels.edit[language]}</span>
            </button>
          )}
        </div>

        {/* VIEW MODE */}
        {!isEditing && (
          <div className="space-y-6">
            {/* Email Notifications */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.emailNotifications[language]}
              </h3>
              <PreferenceDisplay
                label={labels.emailEnabled[language]}
                value={preferences.email_enabled}
                labels={labels}
              />
            </div>

            {/* VGP Alerts */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                {labels.vgpAlerts[language]}
              </h3>
              <p className="text-xs text-gray-500 mb-4">{labels.vgpAlertsDesc[language]}</p>

              <div className="space-y-3">
                <PreferenceDisplay
                  label={labels.vgpEnabled[language]}
                  value={preferences.vgp_alerts.enabled}
                  labels={labels}
                />
                
                {preferences.vgp_alerts.enabled && (
                  <>
                    <div className="flex items-center justify-between py-3 border-t border-gray-200">
                      <span className="text-sm font-medium text-gray-700">{labels.alertTiming[language]}</span>
                      <span className="text-sm text-gray-900">
                        {preferences.vgp_alerts.timing.sort((a, b) => b - a).join(', ')} {labels.daysInAdvance[language]}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-3 border-t border-gray-200">
                      <span className="text-sm font-medium text-gray-700">{labels.recipients[language]}</span>
                      <span className="text-sm text-gray-900">
                        {preferences.vgp_alerts.recipients === 'owner' ? labels.recipientsOwner[language] : labels.recipientsAll[language]}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Digest Mode */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                {labels.digestMode[language]}
              </h3>
              <p className="text-xs text-gray-500 mb-4">{labels.digestModeDesc[language]}</p>

              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-gray-700">{labels.digestMode[language]}</span>
                <span className="text-sm text-gray-900">
                  {preferences.digest_mode === 'daily' && labels.daily[language]}
                  {preferences.digest_mode === 'weekly' && labels.weekly[language]}
                  {preferences.digest_mode === 'realtime' && labels.realtime[language]}
                </span>
              </div>
            </div>

            {/* Other Alerts */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.otherAlerts[language]}
              </h3>

              <div className="space-y-3">
                <PreferenceDisplay
                  label={labels.assetAlerts[language]}
                  value={preferences.asset_alerts}
                  labels={labels}
                />
                <PreferenceDisplay
                  label={labels.auditAlerts[language]}
                  value={preferences.audit_alerts}
                  labels={labels}
                />
              </div>
            </div>
          </div>
        )}

        {/* EDIT MODE */}
        {isEditing && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Notifications */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.emailNotifications[language]}
              </h3>
              <ToggleSwitch
                label={labels.emailEnabled[language]}
                checked={preferences.email_enabled}
                onChange={handleToggleEmail}
              />
            </div>

            {/* VGP Alerts */}
            {preferences.email_enabled && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-900 mb-1">
                  {labels.vgpAlerts[language]}
                </h3>
                <p className="text-xs text-gray-500 mb-4">{labels.vgpAlertsDesc[language]}</p>

                <div className="space-y-4">
                  <ToggleSwitch
                    label={labels.vgpEnabled[language]}
                    checked={preferences.vgp_alerts.enabled}
                    onChange={handleToggleVGPAlerts}
                  />

                  {preferences.vgp_alerts.enabled && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {labels.alertTiming[language]}
                        </label>
                        <p className="text-xs text-gray-500 mb-3">{labels.alertTimingDesc[language]}</p>
                        <div className="space-y-2">
                          {[30, 15, 7, 1].map(days => (
                            <CheckboxField
                              key={days}
                              label={`${days} ${labels.daysInAdvance[language]}`}
                              checked={preferences.vgp_alerts.timing.includes(days)}
                              onChange={() => handleToggleVGPTiming(days)}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {labels.recipients[language]}
                        </label>
                        <select
                          value={preferences.vgp_alerts.recipients}
                          onChange={(e) => handleChangeVGPRecipients(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="owner">{labels.recipientsOwner[language]}</option>
                          <option value="all">{labels.recipientsAll[language]}</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Digest Mode */}
            {preferences.email_enabled && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-900 mb-1">
                  {labels.digestMode[language]}
                </h3>
                <p className="text-xs text-gray-500 mb-4">{labels.digestModeDesc[language]}</p>

                <div>
                  <select
                    value={preferences.digest_mode}
                    onChange={(e) => handleChangeDigestMode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="realtime">{labels.realtime[language]}</option>
                    <option value="daily">{labels.daily[language]}</option>
                    <option value="weekly">{labels.weekly[language]}</option>
                  </select>
                </div>
              </div>
            )}

            {/* Other Alerts */}
            {preferences.email_enabled && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-900 mb-4">
                  {labels.otherAlerts[language]}
                </h3>

                <div className="space-y-3">
                  <CheckboxField
                    label={labels.assetAlerts[language]}
                    checked={preferences.asset_alerts}
                    onChange={handleToggleAssetAlerts}
                  />
                  <CheckboxField
                    label={labels.auditAlerts[language]}
                    checked={preferences.audit_alerts}
                    onChange={handleToggleAuditAlerts}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {labels.cancel[language]}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckIcon className="w-4 h-4" />
                <span>{saving ? labels.saving[language] : labels.save[language]}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Helper Components
function PreferenceDisplay({ label, value, labels }: { label: string; value: boolean; labels: any }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-200 last:border-0">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <span className={`text-sm font-medium ${value ? 'text-green-600' : 'text-gray-400'}`}>
        {value ? labels.yes : labels.no}
      </span>
    </div>
  );
}

function ToggleSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <button
        type="button"
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center space-x-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}