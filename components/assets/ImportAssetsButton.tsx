'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

// ImportAssetsModal does `import * as XLSX from 'xlsx'`, a full-library
// namespace import worth ~119 KB gzipped. It was reaching every visitor to the
// assets list, not just the few who import a spreadsheet.
//
// Loading it on demand means the parser arrives with the modal. Note the
// modal is only MOUNTED when open below: it used to be rendered
// unconditionally with an isOpen prop, which would have defeated this
// entirely, since a mounted component pulls its chunk immediately.
const ImportAssetsModal = dynamic(() => import('./ImportAssetsModal'), {
  loading: () => (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="rounded-lg bg-white px-6 py-5 text-sm text-gray-600 shadow-lg">
        Chargement / Loading...
      </div>
    </div>
  ),
  ssr: false,
})

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
        className="inline-flex items-center px-4 py-2 text-[15px] font-medium rounded-md transition-colors hover:opacity-90"
        style={{ backgroundColor: 'var(--card-bg, #edeff2)', color: 'var(--text-primary, #1a1a1a)', border: '0.5px solid #b8b8b8' }}
      >
        <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
        {t('assets.importFromExcel')}
      </button>

      {/* Mounted only while open, so the xlsx chunk is fetched on first use
          rather than on page load. */}
      {isOpen && (
        <ImportAssetsModal isOpen={isOpen} onClose={() => setIsOpen(false)} onSuccess={onSuccess} />
      )}
    </>
  )
}