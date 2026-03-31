'use client'

import { useState } from 'react'
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import ImportAssetsModal from './ImportAssetsModal'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

interface ImportAssetsButtonProps {
  onSuccess?: () => void
}

export default function ImportAssetsButton({ onSuccess }: ImportAssetsButtonProps) {
  const { language } = useLanguage()
  const t = createTranslator(language)
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors hover:opacity-90"
        style={{ backgroundColor: 'var(--card-bg, #edeff2)', color: 'var(--text-primary, #1a1a1a)', border: '0.5px solid #b8b8b8' }}
      >
        <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
        {t('assets.importFromExcel')}
      </button>

      <ImportAssetsModal isOpen={isOpen} onClose={() => setIsOpen(false)} onSuccess={onSuccess} />
    </>
  )
}