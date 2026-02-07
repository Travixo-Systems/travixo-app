'use client'

import { useState } from 'react'
import { PlusIcon } from '@heroicons/react/24/outline'
import AddAssetModal from './AddAssetModal'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

interface AddAssetButtonProps {
  onSuccess?: () => void
}

export default function AddAssetButton({ onSuccess }: AddAssetButtonProps) {
  const { language } = useLanguage()
  const t = createTranslator(language)
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        <PlusIcon className="h-5 w-5 mr-2" />
        {t('assets.buttonAddAsset')}
      </button>

      <AddAssetModal isOpen={isOpen} onClose={() => setIsOpen(false)} onSuccess={onSuccess} />
    </>
  )
}