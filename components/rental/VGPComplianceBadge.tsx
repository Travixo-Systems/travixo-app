'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

interface VGPComplianceBadgeProps {
  assetId: string
  organizationId?: string
}

interface VGPStatus {
  hasSchedule: boolean
  isCompliant: boolean
  nextDueDate: string | null
  lastResult: string | null
}

export default function VGPComplianceBadge({ assetId, organizationId }: VGPComplianceBadgeProps) {
  const { language } = useLanguage()
  const t = createTranslator(language)
  const [vgpStatus, setVgpStatus] = useState<VGPStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchVGPStatus()
  }, [assetId])

  async function fetchVGPStatus() {
    try {
      const supabase = createClient()

      const { data: schedules } = await supabase
        .from('vgp_schedules')
        .select('id, next_due_date, status, archived_at')
        .eq('asset_id', assetId)
        .is('archived_at', null)
        .order('next_due_date', { ascending: true })
        .limit(1)

      if (!schedules || schedules.length === 0) {
        setVgpStatus({ hasSchedule: false, isCompliant: true, nextDueDate: null, lastResult: null })
        setLoading(false)
        return
      }

      const schedule = schedules[0]
      const isOverdue = new Date(schedule.next_due_date) < new Date()

      const { data: inspections } = await supabase
        .from('vgp_inspections')
        .select('result')
        .eq('asset_id', assetId)
        .order('inspection_date', { ascending: false })
        .limit(1)

      const lastResult = inspections?.[0]?.result || null
      const isNonCompliant = lastResult === 'NON_CONFORME'

      setVgpStatus({
        hasSchedule: true,
        isCompliant: !isOverdue && !isNonCompliant,
        nextDueDate: schedule.next_due_date,
        lastResult,
      })
    } catch {
      setVgpStatus({ hasSchedule: false, isCompliant: true, nextDueDate: null, lastResult: null })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-1/2 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-1/3" />
      </div>
    )
  }

  if (!vgpStatus || !vgpStatus.hasSchedule) {
    return null
  }

  const formatMonth = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      month: 'short',
      year: 'numeric',
    })
  }

  if (vgpStatus.isCompliant) {
    return (
      <div className="bg-green-50 border-l-4 border-b-4 border-green-500 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-bold text-green-800 text-sm">
              {t('rental.vgpCompliant')}
            </p>
            {vgpStatus.nextDueDate && (
              <p className="text-green-700 text-xs mt-0.5">
                {t('rental.vgpNextInspection')}: {formatMonth(vgpStatus.nextDueDate)}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-red-50 border-l-4 border-b-4 border-red-500 rounded-lg p-4">
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-red-600 flex-shrink-0" />
        <div>
          <p className="font-bold text-red-800 text-sm">
            {t('rental.vgpBlocked')}
          </p>
          <p className="text-red-700 text-xs mt-0.5">
            {t('rental.vgpBlockedMessage')}
          </p>
        </div>
      </div>
    </div>
  )
}

export function useVGPBlockStatus(assetId: string): { blocked: boolean; loading: boolean } {
  const [blocked, setBlocked] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      try {
        const supabase = createClient()

        const { data: schedules } = await supabase
          .from('vgp_schedules')
          .select('next_due_date, status')
          .eq('asset_id', assetId)
          .is('archived_at', null)

        if (!schedules || schedules.length === 0) {
          setBlocked(false)
          setLoading(false)
          return
        }

        const hasOverdue = schedules.some(
          s => new Date(s.next_due_date) < new Date() && s.status !== 'completed'
        )

        if (hasOverdue) {
          setBlocked(true)
          setLoading(false)
          return
        }

        const { data: inspections } = await supabase
          .from('vgp_inspections')
          .select('result')
          .eq('asset_id', assetId)
          .order('inspection_date', { ascending: false })
          .limit(1)

        const lastResult = inspections?.[0]?.result
        setBlocked(lastResult === 'NON_CONFORME')
      } catch {
        setBlocked(false)
      } finally {
        setLoading(false)
      }
    }
    check()
  }, [assetId])

  return { blocked, loading }
}
