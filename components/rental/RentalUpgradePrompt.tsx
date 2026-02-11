'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

export default function RentalUpgradePrompt() {
  const { language } = useLanguage()
  const t = createTranslator(language)

  return (
    <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 text-center">
      <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
        <Lock className="w-6 h-6 text-gray-500" />
      </div>
      <h3 className="text-lg font-bold text-[#00252b] mb-2">
        {t('rental.rentalFeatureTitle')}
      </h3>
      <p className="text-gray-600 text-sm mb-4">
        {t('rental.rentalFeatureDescription')}
      </p>
      <Link
        href="/settings/subscription"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#f26f00] text-white font-bold rounded-lg hover:bg-[#d96200] transition-colors text-sm"
      >
        {t('rental.upgradeToUnlock')}
      </Link>
    </div>
  )
}
