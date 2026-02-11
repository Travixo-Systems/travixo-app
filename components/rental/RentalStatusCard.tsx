'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User, AlertTriangle, Handshake, Clock } from 'lucide-react'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

interface RentalStatusCardProps {
  assetId: string
  isAuthenticated: boolean
  onCheckout: () => void
  onReturn: (rental: ActiveRental) => void
}

export interface ActiveRental {
  id: string
  client_name: string
  client_contact: string | null
  checkout_date: string
  expected_return_date: string | null
  checkout_notes: string | null
}

export default function RentalStatusCard({
  assetId,
  isAuthenticated,
  onCheckout,
  onReturn,
}: RentalStatusCardProps) {
  const { language } = useLanguage()
  const t = createTranslator(language)
  const [rental, setRental] = useState<ActiveRental | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchActiveRental()
  }, [assetId])

  async function fetchActiveRental() {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('rentals')
        .select('id, client_name, client_contact, checkout_date, expected_return_date, checkout_notes')
        .eq('asset_id', assetId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

      if (!error && data) {
        setRental(data)
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md border-l-4 border-b-4 border-gray-300 p-6 mb-6 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
      </div>
    )
  }

  // No active rental -- available
  if (!rental) {
    return (
      <div className="bg-white rounded-lg shadow-md border-l-4 border-b-4 border-green-500 p-6 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <Handshake className="w-6 h-6 text-green-600" />
          <h3 className="font-bold text-[#00252b] text-lg">
            {t('rental.availableForRental')}
          </h3>
        </div>
        {isAuthenticated && (
          <button
            onClick={onCheckout}
            className="w-full py-3 bg-[#f26f00] text-white rounded-lg font-bold hover:bg-[#d96200] transition-colors text-sm"
          >
            {t('rental.checkoutToClient')}
          </button>
        )}
      </div>
    )
  }

  // Active rental
  const isOverdue =
    rental.expected_return_date &&
    new Date(rental.expected_return_date) < new Date()

  const daysSince = Math.floor(
    (Date.now() - new Date(rental.checkout_date).getTime()) / 86400000
  )

  const daysOverdue = isOverdue
    ? Math.floor(
        (Date.now() - new Date(rental.expected_return_date!).getTime()) / 86400000
      )
    : 0

  const borderColor = isOverdue ? 'border-red-500' : 'border-blue-500'
  const bgColor = isOverdue ? 'bg-red-50' : 'bg-white'

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(
      language === 'fr' ? 'fr-FR' : 'en-US',
      { day: 'numeric', month: 'short', year: 'numeric' }
    )
  }

  return (
    <div className={`${bgColor} rounded-lg shadow-md border-l-4 border-b-4 ${borderColor} p-6 mb-6`}>
      <div className="flex items-center gap-3 mb-4">
        {isOverdue ? (
          <AlertTriangle className="w-6 h-6 text-red-600" />
        ) : (
          <User className="w-6 h-6 text-blue-600" />
        )}
        <h3 className={`font-bold text-lg ${isOverdue ? 'text-red-800' : 'text-[#00252b]'}`}>
          {isOverdue ? t('rental.overdue') : t('rental.currentlyRented')}
        </h3>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 font-medium">{t('rental.client')}:</span>
          <span className="text-sm font-bold text-[#00252b]">{rental.client_name}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 font-medium">{t('rental.since')}:</span>
          <span className="text-sm font-bold text-[#00252b]">{formatDate(rental.checkout_date)}</span>
        </div>
        {rental.expected_return_date ? (
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 font-medium">
              {isOverdue ? t('rental.overdueBy') : t('rental.expectedBy')}:
            </span>
            <span className={`text-sm font-bold ${isOverdue ? 'text-red-700' : 'text-[#00252b]'}`}>
              {isOverdue
                ? `${daysOverdue} ${t('rental.days')}`
                : formatDate(rental.expected_return_date)
              }
            </span>
          </div>
        ) : (
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 font-medium">{t('rental.expectedBy')}:</span>
            <span className="text-sm font-medium text-gray-500">{t('rental.openEnded')}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 font-medium">{t('rental.duration')}:</span>
          <span className="text-sm font-bold text-[#00252b]">
            {daysSince} {t('rental.days')}
          </span>
        </div>
      </div>

      {isAuthenticated && (
        <button
          onClick={() => onReturn(rental)}
          className={`w-full py-3 rounded-lg font-bold transition-colors text-sm ${
            isOverdue
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-[#f26f00] text-white hover:bg-[#d96200]'
          }`}
        >
          {t('rental.processReturn')}
        </button>
      )}
    </div>
  )
}
