'use client'

import { useState } from 'react'
import { X, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import ClientAutocomplete from './ClientAutocomplete'
import { useVGPBlockStatus } from './VGPComplianceBadge'

interface CheckoutOverlayProps {
  assetId: string
  assetName: string
  organizationId: string
  onClose: () => void
  onSuccess: () => void
}

export default function CheckoutOverlay({
  assetId,
  assetName,
  organizationId,
  onClose,
  onSuccess,
}: CheckoutOverlayProps) {
  const { language } = useLanguage()
  const t = createTranslator(language)

  const [clientName, setClientName] = useState('')
  const [clientContact, setClientContact] = useState('')
  const [expectedReturn, setExpectedReturn] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { blocked: vgpBlocked, loading: vgpLoading } = useVGPBlockStatus(assetId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientName.trim()) {
      setError(language === 'fr' ? 'Le nom du client est requis' : 'Client name is required')
      return
    }

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

      const response = await fetch('/api/rentals/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: assetId,
          client_name: clientName.trim(),
          client_contact: clientContact.trim() || null,
          expected_return_date: expectedReturn || null,
          notes: notes.trim() || null,
          latitude,
          longitude,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMessages: Record<string, string> = {
          asset_not_found: language === 'fr' ? 'Actif non trouvé' : 'Asset not found',
          already_rented: t('rental.alreadyRented'),
          vgp_blocked: t('rental.vgpBlockedMessage'),
          feature_not_available: language === 'fr' ? 'Fonctionnalité non disponible' : 'Feature not available',
        }
        setError(errorMessages[data.error] || data.error || 'Checkout failed')
        return
      }

      onSuccess()
    } catch {
      setError(language === 'fr' ? 'Erreur de connexion' : 'Connection error')
    } finally {
      setSubmitting(false)
    }
  }

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
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-[#00252b]">
                {language === 'fr' ? 'Sortie' : 'Checkout'}: {assetName}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* VGP Block */}
          {vgpBlocked && !vgpLoading && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-red-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-red-800 text-sm">{t('rental.vgpBlocked')}</p>
                  <p className="text-red-700 text-xs mt-1">{t('rental.vgpBlockedMessage')}</p>
                </div>
              </div>
            </div>
          )}

          {!vgpBlocked && !vgpLoading && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-6">
              <ShieldCheck className="w-4 h-4 text-green-600" />
              <span className="text-green-800 text-xs font-medium">{t('rental.vgpCompliant')}</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Client Name */}
            <div>
              <label className="block text-sm font-bold text-[#00252b] mb-2">
                {t('rental.clientName')} *
              </label>
              <ClientAutocomplete
                value={clientName}
                onChange={setClientName}
                organizationId={organizationId}
                placeholder={language === 'fr' ? 'ex: Bouygues Construction' : 'e.g., Bouygues Construction'}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
              />
            </div>

            {/* Client Contact */}
            <div>
              <label className="block text-sm font-bold text-[#00252b] mb-2">
                {t('rental.clientContact')} <span className="text-gray-400 font-normal">({language === 'fr' ? 'optionnel' : 'optional'})</span>
              </label>
              <input
                type="text"
                value={clientContact}
                onChange={(e) => setClientContact(e.target.value)}
                placeholder={language === 'fr' ? 'Téléphone ou email' : 'Phone or email'}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                style={{ fontSize: '16px' }}
                maxLength={255}
              />
            </div>

            {/* Expected Return */}
            <div>
              <label className="block text-sm font-bold text-[#00252b] mb-2">
                {t('rental.expectedReturn')} <span className="text-gray-400 font-normal">({language === 'fr' ? 'optionnel' : 'optional'})</span>
              </label>
              <input
                type="date"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                style={{ fontSize: '16px' }}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-bold text-[#00252b] mb-2">
                Notes <span className="text-gray-400 font-normal">({language === 'fr' ? 'optionnel' : 'optional'})</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={language === 'fr' ? 'Notes de sortie...' : 'Checkout notes...'}
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
                disabled={submitting || vgpBlocked || vgpLoading || !clientName.trim()}
                className="flex-1 py-3 bg-[#f26f00] text-white rounded-lg font-bold hover:bg-[#d96200] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {language === 'fr' ? 'Enregistrement...' : 'Processing...'}
                  </>
                ) : (
                  t('rental.confirmCheckout')
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
