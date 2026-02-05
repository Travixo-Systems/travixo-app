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
import { createTranslator } from '@/lib/i18n';
import { useOrganization, useUpdateNotifications, type NotificationPreferences } from '@/hooks/useOrganization';
import toast from 'react-hot-toast';

export default function NotificationsSettingsPage() {
  const { language } = useLanguage();
  const t = createTranslator(language);
  const { data: organization, isLoading } = useOrganization();
  const { mutateAsync: updateNotifications, isPending: saving } = useUpdateNotifications();

  const [isEditing, setIsEditing] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email_enabled: true,
    vgp_alerts: {
      enabled: true,
      timing: [30, 7, 1],
      recipients: 'owner',
    },
    digest_mode: 'daily',
    asset_alerts: true,
    audit_alerts: true,
  });

  useEffect(() => {
    if (organization?.notification_preferences) {
      // Ensure data structure is correct with fallbacks
      const prefs = organization.notification_preferences;
      
      // Handle recipients: could be string "owner" or array ["owner"]
      let recipientsValue = prefs.vgp_alerts?.recipients || 'owner';
      if (Array.isArray(recipientsValue)) {
        recipientsValue = recipientsValue[0] || 'owner';
      }
      
      setPreferences({
        email_enabled: prefs.email_enabled ?? true,
        vgp_alerts: {
          enabled: prefs.vgp_alerts?.enabled ?? true,
          timing: Array.isArray(prefs.vgp_alerts?.timing) ? prefs.vgp_alerts.timing : [30, 7, 1],
          recipients: recipientsValue,
        },
        digest_mode: prefs.digest_mode || 'daily',
        asset_alerts: prefs.asset_alerts ?? true,
        audit_alerts: prefs.audit_alerts ?? true,
      });
    }
  }, [organization]);

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
      await updateNotifications(preferences);
      toast.success(t('notifications.saveSuccess'));
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error.message || t('notifications.saveError'));
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
          {t('notifications.back')}
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <BellIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                {t('notifications.pageTitle')}
              </h1>
              <p className="text-sm text-gray-600">
                {t('notifications.pageSubtitle')}
              </p>
            </div>
          </div>

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <PencilIcon className="w-4 h-4" />
              <span>{t('notifications.edit')}</span>
            </button>
          )}
        </div>

        {/* VIEW MODE */}
        {!isEditing && (
          <div className="space-y-6">
            {/* Email Notifications */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {t('notifications.emailNotifications')}
              </h3>
              <PreferenceDisplay
                label={t('notifications.emailEnabled')}
                value={preferences.email_enabled}
                yesText={t('notifications.yes')}
                noText={t('notifications.no')}
              />
            </div>

            {/* VGP Alerts */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                {t('notifications.vgpAlerts')}
              </h3>
              <p className="text-xs text-gray-500 mb-4">{t('notifications.vgpAlertsDesc')}</p>

              <div className="space-y-3">
                <PreferenceDisplay
                  label={t('notifications.vgpEnabled')}
                  value={preferences.vgp_alerts.enabled}
                  yesText={t('notifications.yes')}
                  noText={t('notifications.no')}
                />
                
                {preferences.vgp_alerts.enabled && (
                  <>
                    <div className="flex items-center justify-between py-3 border-t border-gray-200">
                      <span className="text-sm font-medium text-gray-700">{t('notifications.alertTiming')}</span>
                      <span className="text-sm text-gray-900">
                        {preferences.vgp_alerts.timing.sort((a, b) => b - a).join(', ')} {t('notifications.daysInAdvance')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-3 border-t border-gray-200">
                      <span className="text-sm font-medium text-gray-700">{t('notifications.recipients')}</span>
                      <span className="text-sm text-gray-900">
                        {preferences.vgp_alerts.recipients === 'owner' ? t('notifications.recipientsOwner') : t('notifications.recipientsAll')}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Digest Mode */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                {t('notifications.digestMode')}
              </h3>
              <p className="text-xs text-gray-500 mb-4">{t('notifications.digestModeDesc')}</p>

              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-gray-700">{t('notifications.digestMode')}</span>
                <span className="text-sm text-gray-900">
                  {preferences.digest_mode === 'daily' && t('notifications.daily')}
                  {preferences.digest_mode === 'weekly' && t('notifications.weekly')}
                  {preferences.digest_mode === 'realtime' && t('notifications.realtime')}
                </span>
              </div>
            </div>

            {/* Other Alerts */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {t('notifications.otherAlerts')}
              </h3>

              <div className="space-y-3">
                <PreferenceDisplay
                  label={t('notifications.assetAlerts')}
                  value={preferences.asset_alerts}
                  yesText={t('notifications.yes')}
                  noText={t('notifications.no')}
                />
                <PreferenceDisplay
                  label={t('notifications.auditAlerts')}
                  value={preferences.audit_alerts}
                  yesText={t('notifications.yes')}
                  noText={t('notifications.no')}
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
                {t('notifications.emailNotifications')}
              </h3>
              <ToggleSwitch
                label={t('notifications.emailEnabled')}
                checked={preferences.email_enabled}
                onChange={handleToggleEmail}
              />
            </div>

            {/* VGP Alerts */}
            {preferences.email_enabled && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-900 mb-1">
                  {t('notifications.vgpAlerts')}
                </h3>
                <p className="text-xs text-gray-500 mb-4">{t('notifications.vgpAlertsDesc')}</p>

                <div className="space-y-4">
                  <ToggleSwitch
                    label={t('notifications.vgpEnabled')}
                    checked={preferences.vgp_alerts.enabled}
                    onChange={handleToggleVGPAlerts}
                  />

                  {preferences.vgp_alerts.enabled && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t('notifications.alertTiming')}
                        </label>
                        <p className="text-xs text-gray-500 mb-3">{t('notifications.alertTimingDesc')}</p>
                        <div className="space-y-2">
                          {[30, 7, 1].map(days => (
                            <CheckboxField
                              key={days}
                              label={`${days} ${t('notifications.daysInAdvance')}`}
                              checked={preferences.vgp_alerts.timing.includes(days)}
                              onChange={() => handleToggleVGPTiming(days)}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t('notifications.recipients')}
                        </label>
                        <select
                          value={preferences.vgp_alerts.recipients || 'owner'}
                          onChange={(e) => handleChangeVGPRecipients(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="owner">{t('notifications.recipientsOwner')}</option>
                          <option value="all">{t('notifications.recipientsAll')}</option>
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
                  {t('notifications.digestMode')}
                </h3>
                <p className="text-xs text-gray-500 mb-4">{t('notifications.digestModeDesc')}</p>

                <div>
                  <select
                    value={preferences.digest_mode || 'daily'}
                    onChange={(e) => handleChangeDigestMode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="realtime">{t('notifications.realtime')}</option>
                    <option value="daily">{t('notifications.daily')}</option>
                    <option value="weekly">{t('notifications.weekly')}</option>
                  </select>
                </div>
              </div>
            )}

            {/* Other Alerts */}
            {preferences.email_enabled && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-900 mb-4">
                  {t('notifications.otherAlerts')}
                </h3>

                <div className="space-y-3">
                  <CheckboxField
                    label={t('notifications.assetAlerts')}
                    checked={preferences.asset_alerts}
                    onChange={handleToggleAssetAlerts}
                  />
                  <CheckboxField
                    label={t('notifications.auditAlerts')}
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
                {t('notifications.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckIcon className="w-4 h-4" />
                <span>{saving ? t('notifications.saving') : t('notifications.save')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Helper Components
function PreferenceDisplay({ label, value, yesText, noText }: { label: string; value: boolean; yesText: string; noText: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-200 last:border-0">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <span className={`text-sm font-medium ${value ? 'text-green-600' : 'text-gray-400'}`}>
        {value ? yesText : noText}
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