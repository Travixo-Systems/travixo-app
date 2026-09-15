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
import MyVGPAlertPreferences from '@/components/settings/MyVGPAlertPreferences';
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
      timing: [30, 15, 7, 1],
      recipients: 'owner',
    },
    digest_mode: 'daily',
    asset_alerts: true,
    audit_alerts: true,
  });

  const normalizeNotificationData = (prefs: any): NotificationPreferences => {
    // Handle recipients: could be string "owner" or array ["owner"]
    let recipientsValue = prefs.vgp_alerts?.recipients || 'owner';
    if (Array.isArray(recipientsValue)) {
      recipientsValue = recipientsValue[0] || 'owner';
    }

    return {
      email_enabled: prefs.email_enabled ?? true,
      vgp_alerts: {
        enabled: prefs.vgp_alerts?.enabled ?? true,
        timing: Array.isArray(prefs.vgp_alerts?.timing) ? prefs.vgp_alerts.timing : [30, 7, 1],
        recipients: recipientsValue,
      },
      digest_mode: prefs.digest_mode || 'daily',
      asset_alerts: prefs.asset_alerts ?? true,
      audit_alerts: prefs.audit_alerts ?? true,
    };
  };

  useEffect(() => {
    if (organization?.notification_preferences) {
      setPreferences(normalizeNotificationData(organization.notification_preferences));
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

  // No handleChangeDigestMode: the control it served is gone. digest_mode is
  // still carried in state and in the PATCH payload, because the org API
  // validates it, but nothing in the UI sets it any more.

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
      setPreferences(normalizeNotificationData(organization.notification_preferences));
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
          className="flex items-center text-[15px] text-[var(--text-muted,#777)] hover:text-[var(--text-primary,#1a1a1a)] mb-6"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          {t('notifications.back')}
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
              <BellIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[var(--text-primary,#1a1a1a)]">
                {t('notifications.pageTitle')}
              </h1>
              <p className="text-[15px] text-[var(--text-muted,#777)]">
                {t('notifications.pageSubtitle')}
              </p>
            </div>
          </div>

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center space-x-2 px-4 py-2 text-[15px] font-medium text-[var(--text-secondary,#444)] bg-[var(--card-bg,#edeff2)] border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <PencilIcon className="w-4 h-4" />
              <span>{t('notifications.edit')}</span>
            </button>
          )}
        </div>

        {/* ================================================================ */}
        {/* SCOPE 1: YOURS                                                   */}
        {/* ================================================================ */}
        {/* First, and labelled by scope, because this is the only section on
            the page that changes the signed-in user's own mail. It sat below
            the organisation cards before, and twice someone scrolled to the
            org "Digest Mode", set it to Weekly, and ended up with no
            user_notification_preferences row at all -- the control they found
            was not the control that governs their delivery.

            Outside the isEditing branches on purpose: those gate the
            ORGANISATION's defaults, which only owners and admins may change.
            This block is every member's control over their own mail and has
            its own save button, so it must not be hidden behind that mode. */}
        <section aria-labelledby="notif-scope-yours" className="mb-10">
          <div className="mb-3">
            <h2
              id="notif-scope-yours"
              className="text-[17px] font-semibold text-[var(--text-primary,#1a1a1a)]"
            >
              {t('notifications.yoursTitle')}
            </h2>
            <p className="text-[13px] text-[var(--text-muted,#777)]">
              {t('notifications.yoursScope')}
            </p>
          </div>
          <MyVGPAlertPreferences />
        </section>

        {/* ================================================================ */}
        {/* SCOPE 2: THE ORGANISATION'S                                      */}
        {/* ================================================================ */}
        <section aria-labelledby="notif-scope-org">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h2
                id="notif-scope-org"
                className="text-[17px] font-semibold text-[var(--text-primary,#1a1a1a)]"
              >
                {t('notifications.orgTitle')}
              </h2>
              <p className="text-[13px] text-[var(--text-muted,#777)]">
                {t('notifications.orgScope')}{' '}
                <span className="text-[var(--text-hint,#888)]">
                  {t('notifications.orgScopeLink')}
                </span>
              </p>
              <p className="text-[12px] text-[var(--text-hint,#888)] mt-1">
                {t('notifications.orgAdminOnly')}
              </p>
            </div>
          </div>

        {/* VIEW MODE */}
        {!isEditing && (
          <div className="space-y-6">
            {/* Email Notifications */}
            <div className="bg-[var(--card-bg,#edeff2)] shadow rounded-lg p-6">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary,#1a1a1a)] mb-4">
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
            <div className="bg-[var(--card-bg,#edeff2)] shadow rounded-lg p-6">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary,#1a1a1a)] mb-1">
                {t('notifications.vgpAlerts')}
              </h3>
              <p className="text-[13px] text-[var(--text-hint,#888)] mb-4">{t('notifications.vgpAlertsDesc')}</p>

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
                      <span className="text-[15px] font-semibold text-[var(--text-secondary,#444)]">{t('notifications.alertTiming')}</span>
                      <span className="text-[15px] text-[var(--text-primary,#1a1a1a)]">
                        {preferences.vgp_alerts.timing.sort((a, b) => b - a).join(', ')} {t('notifications.daysInAdvance')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-3 border-t border-gray-200">
                      <span className="text-[15px] font-semibold text-[var(--text-secondary,#444)]">{t('notifications.recipients')}</span>
                      <span className="text-[15px] text-[var(--text-primary,#1a1a1a)]">
                        {preferences.vgp_alerts.recipients === 'owner' ? t('notifications.recipientsOwner') : t('notifications.recipientsAll')}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* The organisation-level "Digest Mode" card used to sit here.
                It is gone, not relabelled.

                organizations.notification_preferences.digest_mode feeds NO
                routing: lib/vgp/notification-routing.ts never reads it, and
                delivery frequency comes from user_notification_preferences
                .vgp_frequency alone, falling back to DEFAULT_FREQUENCY when a
                user has no row. So the card rendered "Weekly (Monday 8:00 AM)"
                while the person reading it was still on daily_digest -- and
                twice that is exactly what happened.

                Relabelling a control that changes nothing would have kept the
                trap and added a caveat. The field stays in state and in the
                PATCH payload, because the org API still validates it, but it
                is no longer presented as a setting anyone can act on. */}

            {/* Other Alerts */}
            <div className="bg-[var(--card-bg,#edeff2)] shadow rounded-lg p-6">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary,#1a1a1a)] mb-4">
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
            <div className="bg-[var(--card-bg,#edeff2)] shadow rounded-lg p-6">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary,#1a1a1a)] mb-4">
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
              <div className="bg-[var(--card-bg,#edeff2)] shadow rounded-lg p-6">
                <h3 className="text-[15px] font-semibold text-[var(--text-primary,#1a1a1a)] mb-1">
                  {t('notifications.vgpAlerts')}
                </h3>
                <p className="text-[13px] text-[var(--text-hint,#888)] mb-4">{t('notifications.vgpAlertsDesc')}</p>

                <div className="space-y-4">
                  <ToggleSwitch
                    label={t('notifications.vgpEnabled')}
                    checked={preferences.vgp_alerts.enabled}
                    onChange={handleToggleVGPAlerts}
                  />

                  {preferences.vgp_alerts.enabled && (
                    <>
                      <div>
                        <label className="block text-[15px] font-semibold text-[var(--text-secondary,#444)] mb-2">
                          {t('notifications.alertTiming')}
                        </label>
                        <p className="text-[13px] text-[var(--text-hint,#888)] mb-3">{t('notifications.alertTimingDesc')}</p>
                        <div className="space-y-2">
                          {[30, 15, 7, 1].map(days => (
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
                        <label className="block text-[15px] font-semibold text-[var(--text-secondary,#444)] mb-2">
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

            {/* The editable Digest Mode select is removed for the same reason
                as its view-mode counterpart above: digest_mode reaches no
                routing code, so offering it as a choice invited people to set
                their delivery frequency somewhere that could never affect it.
                Personal frequency lives in the "Your notifications" section. */}

            {/* Other Alerts */}
            {preferences.email_enabled && (
              <div className="bg-[var(--card-bg,#edeff2)] shadow rounded-lg p-6">
                <h3 className="text-[15px] font-semibold text-[var(--text-primary,#1a1a1a)] mb-4">
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
                className="px-4 py-2 text-[15px] font-medium text-[var(--text-secondary,#444)] bg-[var(--card-bg,#edeff2)] border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t('notifications.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 text-[15px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckIcon className="w-4 h-4" />
                <span>{saving ? t('notifications.saving') : t('notifications.save')}</span>
              </button>
            </div>
          </form>
        )}
        </section>
      </div>
    </div>
  );
}

// Helper Components
function PreferenceDisplay({ label, value, yesText, noText }: { label: string; value: boolean; yesText: string; noText: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-200 last:border-0">
      <span className="text-[15px] font-semibold text-[var(--text-secondary,#444)]">{label}</span>
      <span className={`text-[15px] font-medium ${value ? 'text-green-600' : 'text-[var(--text-hint,#888)]'}`}>
        {value ? yesText : noText}
      </span>
    </div>
  );
}

function ToggleSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[15px] font-semibold text-[var(--text-secondary,#444)]">{label}</span>
      <button
        type="button"
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-[var(--card-bg,#edeff2)] transition-transform ${
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
      <span className="text-[15px] text-[var(--text-secondary,#444)]">{label}</span>
    </label>
  );
}