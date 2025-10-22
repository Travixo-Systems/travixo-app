'use client'

import { useState } from 'react'
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import ImportAssetsModal from './ImportAssetsModal'

export default function ImportAssetsButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg shadow-sm text-gray-700 bg-white hover:bg-gray-50"
      >
        <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
        Import from Excel
      </button>

      <ImportAssetsModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}