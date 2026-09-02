'use client'

// components/settings/MyVGPAlertPreferences.tsx
//
// The signed-in user's OWN VGP alert settings.
//
// Kept separate from the organization preferences on the same page because the
// two answer different questions and have different permissions: the org block
// is owner/admin-only and decides defaults for everybody, while this one is
// every member's control over their own inbox.

import { useEffect, useState } from 'react'
import { BellAlertIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import { VGP_FREQUENCIES, VGP_THRESHOLDS, type VGPFrequency } from '@/lib/vgp/notification-routing'

/** Threshold values paired with their translation keys, most distant first. */
const THRESHOLD_KEYS: { value: number; key: string }[] = [
  { value: 30, key: 'settings.notifications.myVgpThreshold30' },
  { value: 15, key: 'settings.notifications.myVgpThreshold15' },
  { value: 7, key: 'settings.notifications.myVgpThreshold7' },
  { value: 1, key: 'settings.notifications.myVgpThreshold1' },
  { value: 0, key: 'settings.notifications.myVgpThreshold0' },
]

const FREQUENCY_KEYS: Record<VGPFrequency, { label: string; help: string }> = {
  immediate: { label: 'settings.notifications.myVgpFreqImmediate', help: 'settings.notifications.myVgpFreqImmediateHelp' },
  daily_digest: { label: 'settings.notifications.myVgpFreqDaily', help: 'settings.notifications.myVgpFreqDailyHelp' },
  weekly_digest: { label: 'settings.notifications.myVgpFreqWeekly', help: 'settings.notifications.myVgpFreqWeeklyHelp' },
  off: { label: 'settings.notifications.myVgpFreqOff', help: 'settings.notifications.myVgpFreqOffHelp' },
}

interface ApiPreferences {
  vgp_frequency: VGPFrequency
  vgp_thresholds: number[]
}

export default function MyVGPAlertPreferences() {
  const { language } = useLanguage()
  const t = createTranslator(language)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [frequency, setFrequency] = useState<VGPFrequency>('daily_digest')
  const [thresholds, setThresholds] = useState<number[]>([...VGP_THRESHOLDS])
  // False means the values on screen are org defaults the user has not yet
  // overridden. Shown explicitly so nobody assumes they already chose them.
  const [isOverride, setIsOverride] = useState(false)
  const [orgEnabled, setOrgEnabled] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/settings/notifications/preferences')
        if (!res.ok) throw new Error(String(res.status))
        const json = await res.json()
        if (cancelled) return

        const prefs: ApiPreferences = json.preferences
        setFrequency(prefs.vgp_frequency)
        setThresholds(prefs.vgp_thresholds ?? [])
        setIsOverride(Boolean(json.is_user_override))
        setOrgEnabled(json.org_defaults?.enabled !== false)
      } catch {
        // Leave the defaults on screen rather than blocking the section. The
        // user can still save, which creates their row.
        if (!cancelled) setIsOverride(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleThreshold = (value: number) => {
    setThresholds((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value].sort((a, b) => b - a)
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vgp_frequency: frequency, vgp_thresholds: thresholds }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || String(res.status))
      }

      setIsOverride(true)
      toast.success(t('settings.notifications.myVgpSaved'))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : null
      toast.error(message || t('settings.notifications.myVgpSaveError'))
    } finally {
      setSaving(false)
    }
  }

  // Thresholds are irrelevant when alerts are off; hiding them avoids implying
  // the checkboxes still do something.
  const showThresholds = frequency !== 'off'
  const noThresholdSelected = showThresholds && thresholds.length === 0

  return (
    <div className="bg-[var(--card-bg,#edeff2)] shadow rounded-lg p-6">
      <div className="flex items-start space-x-3 mb-1">
        <BellAlertIcon className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--text-primary,#1a1a1a)]">
            {t('settings.notifications.myVgpTitle')}
          </h3>
          <p className="text-[13px] text-[var(--text-hint,#888)]">
            {t('settings.notifications.myVgpSubtitle')}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {!orgEnabled && (
            <p className="mt-4 text-[13px] text-amber-800 bg-amber-50 border-l-4 border-amber-400 px-3 py-2 rounded-r">
              {t('settings.notifications.myVgpOrgDisabled')}
            </p>
          )}

          {!isOverride && (
            <p className="mt-4 text-[13px] text-[var(--text-hint,#888)] italic">
              {t('settings.notifications.myVgpInheriting')}
            </p>
          )}

          {/* Frequency */}
          <fieldset className="mt-5">
            <legend className="text-[15px] font-semibold text-[var(--text-secondary,#444)] mb-3">
              {t('settings.notifications.myVgpFrequencyTitle')}
            </legend>
            <div className="space-y-2">
              {VGP_FREQUENCIES.map((freq) => (
                <label
                  key={freq}
                  className="flex items-start space-x-3 cursor-pointer p-2 rounded hover:bg-black/[0.03]"
                >
                  <input
                    type="radio"
                    name="vgp_frequency"
                    value={freq}
                    checked={frequency === freq}
                    onChange={() => setFrequency(freq)}
                    className="w-4 h-4 mt-0.5 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-[15px] text-[var(--text-secondary,#444)]">
                      {t(FREQUENCY_KEYS[freq].label)}
                    </span>
                    <span className="block text-[13px] text-[var(--text-hint,#888)]">
                      {t(FREQUENCY_KEYS[freq].help)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Thresholds */}
          {showThresholds && (
            <fieldset className="mt-6">
              <legend className="text-[15px] font-semibold text-[var(--text-secondary,#444)]">
                {t('settings.notifications.myVgpThresholdsTitle')}
              </legend>
              <p className="text-[13px] text-[var(--text-hint,#888)] mb-3">
                {t('settings.notifications.myVgpThresholdsHelp')}
              </p>
              <div className="space-y-2">
                {THRESHOLD_KEYS.map(({ value, key }) => (
                  <label key={value} className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={thresholds.includes(value)}
                      onChange={() => toggleThreshold(value)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-[15px] text-[var(--text-secondary,#444)]">
                      {t(key)}
                    </span>
                  </label>
                ))}
              </div>

              {noThresholdSelected && (
                <p className="mt-3 text-[13px] text-amber-800">
                  {t('settings.notifications.myVgpThresholdsEmpty')}
                </p>
              )}
            </fieldset>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-[15px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? t('settings.notifications.saving') : t('settings.notifications.myVgpSave')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
