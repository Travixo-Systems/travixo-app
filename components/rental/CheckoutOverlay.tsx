'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, ShieldAlert, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import { useVGPBlockStatus } from './VGPComplianceBadge'

interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
}

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

  // Client selection
  const [mode, setMode] = useState<'select' | 'new'>('select')
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientContact, setClientContact] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')

  // Rental fields
  const [expectedReturn, setExpectedReturn] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { blocked: vgpBlocked, loading: vgpLoading } = useVGPBlockStatus(assetId)

  // Fetch clients for search
  const fetchClients = useCallback(async (q: string) => {
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      params.set('limit', '10')
      const res = await fetch(`/api/clients?${params}`)
      if (res.ok) {
        const data = await res.json()
        setClients(data.clients || [])
      }
    } catch {
      // Silent fail
    }
  }, [])

  useEffect(() => {
    fetchClients('')
  }, [fetchClients])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (mode === 'select') fetchClients(clientSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [clientSearch, mode, fetchClients])

  function selectClient(client: Client) {
    setSelectedClientId(client.id)
    setClientName(client.name)
    setClientContact(client.phone || client.email || '')
    setClientSearch(client.name)
  }

  function switchToNew() {
    setMode('new')
    setSelectedClientId(null)
    setClientName('')
    setClientContact('')
    setClientEmail('')
    setClientPhone('')
  }

  function switchToSelect() {
    setMode('select')
    setSelectedClientId(null)
    setClientName('')
    setClientSearch('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const name = mode === 'select' ? clientName : clientName
    if (!name.trim()) {
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

      // If new client, create first
      let clientId = selectedClientId
      if (mode === 'new' && !clientId) {
        const createRes = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: clientName.trim(),
            email: clientEmail.trim() || null,
            phone: clientPhone.trim() || null,
          }),
        })
        if (createRes.ok) {
          const newClient = await createRes.json()
          clientId = newClient.id
        }
        // If client creation fails (e.g. duplicate), continue without client_id
      }

      const response = await fetch('/api/rentals/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: assetId,
          client_name: name.trim(),
          client_contact: clientContact.trim() || null,
          expected_return_date: expectedReturn || null,
          notes: notes.trim() || null,
          client_id: clientId || null,
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

  const isValid = mode === 'select'
    ? !!selectedClientId
    : !!clientName.trim()

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
            {/* Mode toggle */}
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={switchToSelect}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm border-2 transition-all ${
                  mode === 'select'
                    ? 'bg-[#00252b] text-white border-[#00252b]'
                    : 'bg-white text-[#00252b] border-gray-300 hover:border-[#00252b]'
                }`}
              >
                <Users className="w-4 h-4" />
                {t('rental.selectClient')}
              </button>
              <button
                type="button"
                onClick={switchToNew}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm border-2 transition-all ${
                  mode === 'new'
                    ? 'bg-[#00252b] text-white border-[#00252b]'
                    : 'bg-white text-[#00252b] border-gray-300 hover:border-[#00252b]'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                {t('rental.newClient')}
              </button>
            </div>

            {/* Client Selection Mode */}
            {mode === 'select' && (
              <div>
                <label className="block text-sm font-bold text-[#00252b] mb-2">
                  {t('rental.clientName')} *
                </label>
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value)
                    if (selectedClientId) {
                      setSelectedClientId(null)
                      setClientName('')
                    }
                  }}
                  placeholder={language === 'fr' ? 'Rechercher un client...' : 'Search clients...'}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                  style={{ fontSize: '16px' }}
                />
                {!selectedClientId && clients.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                    {clients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => selectClient(client)}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                      >
                        <span className="font-bold text-sm text-[#00252b]">{client.name}</span>
                        {client.company && (
                          <span className="text-xs text-gray-500 ml-2">{client.company}</span>
                        )}
                        {(client.phone || client.email) && (
                          <span className="block text-xs text-gray-400 mt-0.5">
                            {client.phone || client.email}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {selectedClientId && (
                  <div className="mt-2 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <Users className="w-4 h-4 text-green-600" />
                    <span className="text-green-800 text-sm font-medium">{clientName}</span>
                  </div>
                )}
              </div>
            )}

            {/* New Client Mode */}
            {mode === 'new' && (
              <>
                <div>
                  <label className="block text-sm font-bold text-[#00252b] mb-2">
                    {t('rental.clientName')} *
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder={language === 'fr' ? 'ex: Bouygues Construction' : 'e.g., Bouygues Construction'}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                    style={{ fontSize: '16px' }}
                    maxLength={255}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-[#00252b] mb-2">
                      {t('rental.clientEmail')} <span className="text-gray-400 font-normal text-xs">({language === 'fr' ? 'opt.' : 'opt.'})</span>
                    </label>
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                      style={{ fontSize: '16px' }}
                      maxLength={255}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[#00252b] mb-2">
                      {t('rental.clientPhone')} <span className="text-gray-400 font-normal text-xs">({language === 'fr' ? 'opt.' : 'opt.'})</span>
                    </label>
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="+33 6..."
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                      style={{ fontSize: '16px' }}
                      maxLength={20}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Client Contact (both modes) */}
            {mode === 'select' && (
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
            )}

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
                disabled={submitting || vgpBlocked || vgpLoading || !isValid}
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
