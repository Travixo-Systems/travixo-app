'use client'

import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

const RETIRE_REASONS = [
  { value: 'vendu', labelFr: 'Vendu', labelEn: 'Sold' },
  { value: 'ferraille', labelFr: 'Ferraillé', labelEn: 'Scrapped' },
  { value: 'transfere', labelFr: 'Transféré', labelEn: 'Transferred' },
  { value: 'hors_service', labelFr: 'Hors service', labelEn: 'Out of service' },
] as const

interface RetireAssetModalProps {
  isOpen: boolean
  onClose: () => void
  asset: {
    id: string
    name: string
    serial_number: string | null
  }
}

export default function RetireAssetModal({ isOpen, onClose, asset }: RetireAssetModalProps) {
  const supabase = createClient()
  const { language } = useLanguage()
  const t = createTranslator(language)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedReason, setSelectedReason] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  const handleRetire = async () => {
    if (!selectedReason) return
    setIsLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('assets')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: user.id,
          archive_reason: selectedReason,
          status: 'retired',
        })
        .eq('id', asset.id)

      if (error) throw error

      toast.success(
        language === 'fr'
          ? 'Équipement retiré du parc actif'
          : 'Equipment retired from active fleet'
      )
      onClose()
    } catch (error) {
      console.error('Error retiring asset:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : language === 'fr' ? 'Erreur lors du retrait' : 'Failed to retire asset'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className="w-full max-w-[560px] transform overflow-hidden rounded-xl p-6 transition-all"
                style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <Dialog.Title
                      className="text-lg font-medium"
                      style={{ color: 'var(--text-primary, #1a1a1a)' }}
                    >
                      Retirer cet équipement
                    </Dialog.Title>
                    <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted, #777)' }}>
                      Cet équipement sera retiré du parc actif
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="transition-colors"
                    style={{ color: 'var(--text-muted, #777)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary, #1a1a1a)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Equipment identity block */}
                <div
                  className="rounded-lg px-4 py-3 mb-4"
                  style={{ backgroundColor: 'var(--page-bg, #e3e5e9)' }}
                >
                  <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                    {asset.name}
                  </p>
                  {asset.serial_number && (
                    <p className="text-[13px]" style={{ color: 'var(--text-muted, #777)' }}>
                      {asset.serial_number}
                    </p>
                  )}
                </div>

                {/* Reason selector — pill buttons */}
                <div className="mb-4">
                  <label
                    className="block text-[13px] font-medium mb-2"
                    style={{ color: 'var(--text-primary, #1a1a1a)' }}
                  >
                    Raison du retrait <span style={{ color: 'var(--status-retard, #dc2626)' }}>*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {RETIRE_REASONS.map((reason) => {
                      const isSelected = selectedReason === reason.value
                      return (
                        <button
                          key={reason.value}
                          type="button"
                          onClick={() => setSelectedReason(reason.value)}
                          className="px-4 py-2 rounded-full text-[13px] font-medium transition-colors"
                          style={isSelected ? {
                            backgroundColor: 'var(--accent, #e8600a)',
                            color: '#fff',
                          } : {
                            backgroundColor: 'var(--input-bg, #e3e5e9)',
                            color: 'var(--text-secondary, #444)',
                          }}
                        >
                          {language === 'fr' ? reason.labelFr : reason.labelEn}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Notes textarea */}
                <div className="mb-4">
                  <label
                    className="block text-[13px] font-medium mb-1"
                    style={{ color: 'var(--text-primary, #1a1a1a)' }}
                  >
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
                    style={{
                      backgroundColor: 'var(--input-bg, #e3e5e9)',
                      color: 'var(--text-primary, #1a1a1a)',
                    }}
                  />
                </div>

                {/* Warning callout — amber */}
                <div
                  className="rounded-lg px-4 py-3 mb-6"
                  style={{
                    backgroundColor: 'rgba(217, 119, 6, 0.08)',
                    borderLeft: '3px solid #d97706',
                  }}
                >
                  <p className="text-[13px]" style={{ color: '#92400e' }}>
                    L&apos;équipement sera retiré du parc actif mais ses données
                    (inspections VGP, historique) seront conservées.
                    Vous pourrez le restaurer ultérieurement.
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    className="px-4 py-2 text-[15px] font-medium rounded-md transition-colors disabled:opacity-50"
                    style={{ color: 'var(--text-muted, #777)' }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleRetire}
                    disabled={isLoading || !selectedReason}
                    className="px-4 py-2 text-[15px] font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--accent, #e8600a)' }}
                  >
                    {isLoading ? 'Retrait en cours...' : "Retirer l'équipement"}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
