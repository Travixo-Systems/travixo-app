'use client'

import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

interface DeleteAssetDialogProps {
  isOpen: boolean
  onClose: () => void
  asset: {
    id: string
    name: string
  }
}

export default function DeleteAssetDialog({ isOpen, onClose, asset }: DeleteAssetDialogProps) {
  const router = useRouter()
  const supabase = createClient()
  const { language } = useLanguage()
  const t = createTranslator(language)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)

    try {
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('id', asset.id)

      if (error) throw error

      toast.success(t('assets.toastDeleted'))
      router.refresh()
      onClose()
    } catch (error) {
      console.error('Error deleting asset:', error)
      toast.error(error instanceof Error ? error.message : t('assets.errorDeleteFailed'))
    } finally {
      setIsDeleting(false)
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
          <div className="fixed inset-0 bg-black bg-opacity-25" />
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-shrink-0">
                    <ExclamationTriangleIcon className="h-10 w-10 text-red-600" />
                  </div>
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                      {t('assets.deleteTitle')}
                    </Dialog.Title>
                    <p className="text-sm text-gray-500 mt-1">
                      {t('assets.deleteWarning')}
                    </p>
                  </div>
                </div>

                <p className="text-gray-700 mb-6">
                  {t('assets.deleteConfirmation')} <strong>{asset.name}</strong>? {t('assets.deleteConsequence')}
                </p>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isDeleting}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    {t('assets.buttonCancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? t('assets.buttonDeleting') : t('assets.buttonDelete')}
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