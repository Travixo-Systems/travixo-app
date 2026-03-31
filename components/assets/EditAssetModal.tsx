'use client'

import { Fragment, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

interface Asset {
  id: string
  name: string
  serial_number: string | null
  description: string | null
  current_location: string | null
  status: string
  purchase_date: string | null
  purchase_price: number | null
  current_value: number | null
}

interface EditAssetModalProps {
  isOpen: boolean
  onClose: () => void
  asset: Asset
}

export default function EditAssetModal({ isOpen, onClose, asset }: EditAssetModalProps) {
  const router = useRouter()
  const supabase = createClient()
  const { language } = useLanguage()
  const t = createTranslator(language)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    serial_number: '',
    description: '',
    current_location: '',
    status: 'available',
    purchase_date: '',
    purchase_price: '',
    current_value: '',
  })

  // Populate form when asset changes
  useEffect(() => {
    if (asset) {
      setFormData({
        name: asset.name || '',
        serial_number: asset.serial_number || '',
        description: asset.description || '',
        current_location: asset.current_location || '',
        status: asset.status || 'available',
        purchase_date: asset.purchase_date || '',
        purchase_price: asset.purchase_price?.toString() || '',
        current_value: asset.current_value?.toString() || '',
      })
    }
  }, [asset])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { error } = await supabase
        .from('assets')
        .update({
          name: formData.name,
          serial_number: formData.serial_number || null,
          description: formData.description || null,
          current_location: formData.current_location || null,
          status: formData.status,
          purchase_date: formData.purchase_date || null,
          purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
          current_value: formData.current_value ? parseFloat(formData.current_value) : null,
        })
        .eq('id', asset.id)

      if (error) throw error

      toast.success(t('assets.toastAssetUpdated'))
      router.refresh()
      onClose()
    } catch (error) {
      console.error('Error updating asset:', error)
      toast.error(error instanceof Error ? error.message : t('assets.errorUpdateFailed'))
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
              <Dialog.Panel className="w-full max-w-[560px] transform overflow-hidden rounded-xl p-6 transition-all" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
                <div className="flex justify-between items-center mb-4">
                  <Dialog.Title className="text-lg font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                    {t('assets.editAssetTitle')}
                  </Dialog.Title>
                  <button onClick={onClose} className="transition-colors" style={{ color: 'var(--text-muted, #777)' }} onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary, #1a1a1a)' }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-[13px] font-medium mb-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                        {t('assets.labelAssetName')} *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium mb-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                        {t('assets.labelSerialNumber')}
                      </label>
                      <input
                        type="text"
                        value={formData.serial_number}
                        onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium mb-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                        {t('assets.labelCurrentLocation')}
                      </label>
                      <input
                        type="text"
                        value={formData.current_location}
                        onChange={(e) => setFormData({ ...formData, current_location: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium mb-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                        {t('assets.labelStatus')}
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                      >
                        <option value="available">{t('assets.statusAvailable')}</option>
                        <option value="in_use">{t('assets.statusInUse')}</option>
                        <option value="maintenance">{t('assets.statusMaintenance')}</option>
                        <option value="retired">{t('assets.statusRetired')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium mb-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                        {t('assets.labelPurchaseDate')}
                      </label>
                      <input
                        type="date"
                        value={formData.purchase_date}
                        onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium mb-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                        {t('assets.labelPurchasePrice')} (EUR)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.purchase_price}
                        onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium mb-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                        {t('assets.labelCurrentValue')} (EUR)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.current_value}
                        onChange={(e) => setFormData({ ...formData, current_value: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[13px] font-medium mb-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                        {t('assets.labelDescription')}
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium rounded-md transition-colors" style={{ color: 'var(--text-muted, #777)' }}
                    >
                      {t('assets.buttonCancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="px-4 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{ backgroundColor: 'var(--accent, #e8600a)' }}
                    >
                      {isLoading ? t('assets.buttonSaving') : t('assets.buttonSaveChanges')}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}