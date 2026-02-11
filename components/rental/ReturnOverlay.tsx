'use client'

import { useState } from 'react'
import { X, Loader2, Navigation } from 'lucide-react'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import type { ActiveRental } from './RentalStatusCard'

interface ReturnOverlayProps {
  rental: ActiveRental
  assetName: string
  onClose: () => void
  onSuccess: () => void
}

export default function ReturnOverlay({
  rental,
  assetName,
  onClose,
  onSuccess,
}: ReturnOverlayProps) {
  const { language } = useLanguage()
  const t = createTranslator(language)

  const [condition, setCondition] = useState<'good' | 'fair' | 'damaged' | ''>('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [gettingGPS, setGettingGPS] = useState(false)
  const [error, setError] = useState('')

  const daysSince = Math.floor(
    (Date.now() - new Date(rental.checkout_date).getTime()) / 86400000
  )

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(
      language === 'fr' ? 'fr-FR' : 'en-US',
      { day: 'numeric', month: 'short', year: 'numeric' }
    )
  }

  function handleUseGPS() {
    if (!navigator.geolocation) return
    setGettingGPS(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setLocation(`GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
        setGettingGPS(false)
      },
      () => {
        setGettingGPS(false)
      }
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    setSubmitting(true)
    setError('')

    try {
      let latitude: number | undefined
      let longitude: number | undefined

      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              maximumAge: 60000,
            })
          })
          latitude = position.coords.latitude
          longitude = position.coords.longitude
        } catch {
          // Silent fail
        }
      }

      const response = await fetch('/api/rentals/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rental_id: rental.id,
          return_condition: condition || null,
          return_notes: notes.trim() || null,
          location: location.trim() || null,
          latitude,
          longitude,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || (language === 'fr' ? 'Erreur lors du retour' : 'Return failed'))
        return
      }

      onSuccess()
    } catch {
      setError(language === 'fr' ? 'Erreur de connexion' : 'Connection error')
    } finally {
      setSubmitting(false)
    }
  }

  const conditionButtons: { value: 'good' | 'fair' | 'damaged'; label: string; color: string; selectedColor: string }[] = [
    {
      value: 'good',
      label: t('rental.conditionGood'),
      color: 'border-green-400 text-green-700 hover:bg-green-50',
      selectedColor: 'bg-green-500 text-white border-green-600',
    },
    {
      value: 'fair',
      label: t('rental.conditionFair'),
      color: 'border-amber-400 text-amber-700 hover:bg-amber-50',
      selectedColor: 'bg-amber-500 text-white border-amber-600',
    },
    {
      value: 'damaged',
      label: t('rental.conditionDamaged'),
      color: 'border-red-400 text-red-700 hover:bg-red-50',
      selectedColor: 'bg-red-500 text-white border-red-600',
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl shadow-2xl animate-slide-up max-h-[85vh] overflow-y-auto">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-6 pb-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold text-[#00252b]">
                {language === 'fr' ? 'Retour' : 'Return'}: {assetName}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Rental summary */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 font-medium">{t('rental.client')}:</span>
                <span className="text-xs font-bold text-[#00252b]">{rental.client_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 font-medium">{t('rental.since')}:</span>
                <span className="text-xs font-bold text-[#00252b]">{formatDate(rental.checkout_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 font-medium">{t('rental.duration')}:</span>
                <span className="text-xs font-bold text-[#00252b]">{daysSince} {t('rental.days')}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Condition */}
            <div>
              <label className="block text-sm font-bold text-[#00252b] mb-2">
                {t('rental.returnCondition')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {conditionButtons.map((btn) => (
                  <button
                    key={btn.value}
                    type="button"
                    onClick={() => setCondition(btn.value)}
                    className={`py-3 rounded-lg font-bold text-sm border-2 transition-all min-h-[48px] ${
                      condition === btn.value ? btn.selectedColor : `bg-white ${btn.color}`
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Return Location */}
            <div>
              <label className="block text-sm font-bold text-[#00252b] mb-2">
                {language === 'fr' ? 'Emplacement de retour' : 'Return Location'} <span className="text-gray-400 font-normal">({language === 'fr' ? 'optionnel' : 'optional'})</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={language === 'fr' ? 'ex: Dépôt Paris' : 'e.g., Paris Depot'}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                  style={{ fontSize: '16px' }}
                  maxLength={255}
                />
                <button
                  type="button"
                  onClick={handleUseGPS}
                  disabled={gettingGPS}
                  className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold disabled:opacity-50 min-h-[48px] flex items-center gap-1"
                >
                  <Navigation className="w-4 h-4" />
                  GPS
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-bold text-[#00252b] mb-2">
                Notes <span className="text-gray-400 font-normal">({language === 'fr' ? 'optionnel' : 'optional'})</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={language === 'fr' ? 'Notes de retour...' : 'Return notes...'}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                style={{ fontSize: '16px' }}
                rows={2}
                maxLength={500}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 bg-[#f26f00] text-white rounded-lg font-bold hover:bg-[#d96200] transition-colors disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {language === 'fr' ? 'Enregistrement...' : 'Processing...'}
                  </>
                ) : (
                  t('rental.confirmReturn')
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-6 py-3 bg-white text-[#00252b] border-2 border-[#00252b] rounded-lg font-bold hover:bg-[#00252b] hover:text-white transition-all disabled:opacity-50 min-h-[48px]"
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
