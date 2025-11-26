'use client'

import { useState } from 'react'
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import ImportAssetsModal from './ImportAssetsModal'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

export default function ImportAssetsButton() {
  const { language } = useLanguage()
  const t = createTranslator(language)
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg shadow-sm text-gray-700 bg-white hover:bg-gray-50"
      >
        <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
        {t('assets.importFromExcel')}
      </button>

      <ImportAssetsModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}