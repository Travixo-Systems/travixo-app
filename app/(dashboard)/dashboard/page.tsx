'use client'

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/lib/LanguageContext"
import { createTranslator } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/client"
import OnboardingBanner from "@/components/dashboard/OnboardingBanner"

interface DashboardData {
  orgName: string
  orgId: string
  onboardingCompleted: boolean
  totalAssets: number
  inUseAssets: number
  vgpOverdue: number
  vgpUpcoming: number
  vgpCompliant: number
  vgpComplianceRate: number
  recentScans: number
  utilizationRate: number
  assetsValue: number
  savingsFromLossPrevention: number
}

export default function DashboardPage() {
  const { language } = useLanguage()
  const t = createTranslator(language)
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    const supabase = createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Get user profile and org
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id, organizations(name, onboarding_completed, demo_data_seeded)')
      .eq('id', user.id)
      .single()

    const orgId = profile?.organization_id
    const orgInfo = (profile as unknown as { organizations: { name: string; onboarding_completed: boolean; demo_data_seeded: boolean } | null })?.organizations
    const orgName = orgInfo?.name || 'Your Organization'
    const onboardingCompleted = orgInfo?.onboarding_completed ?? true

    // Auto-trigger onboarding for existing orgs that haven't been seeded yet
    if (orgId && orgInfo && !orgInfo.demo_data_seeded) {
      fetch('/api/internal/post-registration', { method: 'POST' }).catch(() => {})
    }

    // Get asset counts
    const { count: totalAssets } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId!)

    const { count: inUseAssets } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId!)
      .eq('status', 'in_use')

    // Get VGP schedules
    const { data: vgpSchedules } = await supabase
      .from('vgp_schedules')
      .select(`
        id,
        next_due_date,
        status,
        assets (
          id,
          name,
          serial_number,
          current_location,
          asset_categories (name)
        )
      `)
      .eq('organization_id', orgId!)

    // Calculate VGP stats
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    let vgpOverdue = 0
    let vgpUpcoming = 0
    let vgpCompliant = 0

    vgpSchedules?.forEach(schedule => {
      const dueDate = new Date(schedule.next_due_date)
      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysUntil < 0) {
        vgpOverdue++
      } else if (daysUntil <= 30) {
        vgpUpcoming++
      } else {
        vgpCompliant++
      }
    })

    const vgpTotal = vgpSchedules?.length || 0
    const vgpComplianceRate = vgpTotal > 0 ? Math.round((vgpCompliant / vgpTotal) * 100) : 100

    // Get recent scans
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const { count: recentScans } = await supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .gte('scanned_at', sevenDaysAgo.toISOString())

    // Calculate metrics
    const utilizationRate = totalAssets && inUseAssets 
      ? Math.round((inUseAssets / totalAssets) * 100) 
      : 0

    const assetsValue = (totalAssets || 0) * 14500
    const savingsFromLossPrevention = assetsValue * 0.012

    setData({
      orgName,
      orgId: orgId || '',
      onboardingCompleted,
      totalAssets: totalAssets || 0,
      inUseAssets: inUseAssets || 0,
      vgpOverdue,
      vgpUpcoming,
      vgpCompliant,
      vgpComplianceRate,
      recentScans: recentScans || 0,
      utilizationRate,
      assetsValue,
      savingsFromLossPrevention,
    })
    
    setLoading(false)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!data) return null

  const {
    orgName,
    orgId,
    onboardingCompleted,
    totalAssets,
    vgpOverdue,
    vgpUpcoming,
    vgpCompliant,
    vgpComplianceRate,
    recentScans,
    utilizationRate,
    assetsValue,
    savingsFromLossPrevention,
  } = data

  return (
    <div className="space-y-6 p-6">
      {/* Onboarding Banner */}
      {orgId && (
        <OnboardingBanner
          organizationId={orgId}
          onboardingCompleted={onboardingCompleted}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{orgName}</h1>
          <p className="text-slate-600 mt-1 text-sm">
            {t('dashboard.title')}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {t('dashboard.logout')}
        </button>
      </div>

      {/* Critical Alert */}
      {vgpOverdue > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-semibold text-red-800">
                {vgpOverdue} {vgpOverdue > 1 ? t('dashboard.vgpOverdueAlertPlural') : t('dashboard.vgpOverdueAlert')}
              </h3>
              <p className="text-sm text-red-700 mt-1">
                {t('dashboard.vgpRiskSanctions')}: €{(vgpOverdue * 15000).toLocaleString()} - €{(vgpOverdue * 75000).toLocaleString()}
                <Link href="/vgp/schedules?filter=overdue" className="font-medium underline ml-2">
                  {t('dashboard.handleNow')} →
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-600 uppercase tracking-wide">{t('dashboard.equipmentLoss')}</p>
          <p className="text-3xl font-bold text-green-600 mt-1">0.8%</p>
          <p className="text-xs text-slate-600 mt-2">{t('dashboard.vsIndustry')} 2-5%</p>
          <p className="text-xs font-semibold text-green-600 mt-1">
            €{Math.round(savingsFromLossPrevention).toLocaleString()} {t('dashboard.savedThisYear')}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-600 uppercase tracking-wide">{t('dashboard.vgpCompliance')}</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{vgpComplianceRate}%</p>
          <p className="text-xs text-slate-600 mt-2">
            {vgpOverdue} {vgpOverdue !== 1 ? t('dashboard.overduePlural') : t('dashboard.overdue')}, {vgpUpcoming} {t('dashboard.upcoming')}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-600 uppercase tracking-wide">{t('dashboard.utilizationRate')}</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{utilizationRate}%</p>
          <p className="text-xs text-slate-600 mt-2">{t('dashboard.vsTarget')} 65%</p>
          <p className="text-xs text-slate-500 mt-1">
            €{Math.round(assetsValue * (utilizationRate / 100)).toLocaleString()} {t('dashboard.inRental')}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-600">{t('dashboard.totalEquipment')}</p>
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{totalAssets}</p>
          <p className="text-xs text-slate-500 mt-1">
            {t('dashboard.value')}: €{(assetsValue / 1000000).toFixed(1)}M
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-600">{t('dashboard.vgpCompliance')}</p>
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{vgpComplianceRate}%</p>
          <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
            <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${vgpComplianceRate}%` }}></div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-600">{t('dashboard.scans7Days')}</p>
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{recentScans}</p>
          <p className="text-xs text-slate-500 mt-1">{t('dashboard.tracingActivity')}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-600">{t('dashboard.utilization')}</p>
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{utilizationRate}%</p>
          <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
            <div className="bg-green-600 h-2 rounded-full" style={{ width: `${utilizationRate}%` }}></div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-base font-semibold text-slate-900">{t('dashboard.quickActions')}</h2>
        <p className="text-xs text-slate-600 mt-0.5">{t('dashboard.quickActionsSubtitle')}</p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 mt-4">
          <Link href="/assets" className="flex items-center gap-2 px-3 py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="text-sm font-medium">{t('dashboard.addEquipment')}</span>
          </Link>
          
          <Link href="/qr-codes" className="flex items-center gap-2 px-3 py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <span className="text-sm font-medium">{t('dashboard.generateQRCodes')}</span>
          </Link>

          <Link href="/vgp/schedules" className="flex items-center gap-2 px-3 py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-medium">{t('dashboard.recordVGP')}</span>
          </Link>

          <Link href="/audits/new" className="flex items-center gap-2 px-3 py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium">{t('dashboard.launchAudit')}</span>
          </Link>
        </div>
      </div>

      {/* VGP Compliance Details */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-base font-semibold text-slate-900">{t('dashboard.vgpComplianceRegulatory')}</h2>
        <p className="text-xs text-slate-600 mt-0.5">
          {t('dashboard.vgpComplianceSubtitle')}
        </p>
        
        <div className="space-y-3 mt-4">
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-slate-900">{t('dashboard.vgpOverdueLabel')}</p>
                <p className="text-xs text-slate-600">{t('dashboard.vgpOverdueDesc')}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-red-600">{vgpOverdue}</p>
              {vgpOverdue > 0 && (
                <Link href="/vgp/schedules?filter=overdue" className="text-xs text-blue-600 hover:underline">
                  {t('dashboard.handleNow')}
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                <svg className="h-4 w-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-slate-900">{t('dashboard.vgpUpcomingLabel')}</p>
                <p className="text-xs text-slate-600">{t('dashboard.vgpUpcomingDesc')}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-yellow-600">{vgpUpcoming}</p>
              {vgpUpcoming > 0 && (
                <Link href="/vgp/schedules?filter=upcoming" className="text-xs text-blue-600 hover:underline">
                  {t('dashboard.schedule')}
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-slate-900">{t('dashboard.compliant')}</p>
                <p className="text-xs text-slate-600">{t('dashboard.inspectionsUpToDate')}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-green-600">{vgpCompliant}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200">
          <Link href="/vgp" className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('dashboard.accessVGPModule')}
          </Link>
        </div>
      </div>

      {/* ROI Impact */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-base font-semibold text-slate-900">{t('dashboard.roiImpact')}</h2>
        </div>
        
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-xs text-slate-600">{t('dashboard.lossesAvoided')}</p>
            <p className="text-2xl font-bold text-green-600">
              €{Math.round(savingsFromLossPrevention).toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{t('dashboard.thisYear')}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">{t('dashboard.auditGain')}</p>
            <p className="text-2xl font-bold text-blue-600">32 {t('dashboard.hours')}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t('dashboard.perQuarter')}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">{t('dashboard.vgpSanctionsAvoided')}</p>
            <p className="text-2xl font-bold text-green-600">€0</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {vgpComplianceRate === 100 ? t('dashboard.compliance100') : `${vgpComplianceRate}% ${t('dashboard.compliancePercent')}`}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-600 mt-3">
          <strong>{t('dashboard.traviXOCost')}:</strong> €750/mois (Growth Pack) • 
          <strong className="text-green-700 ml-2">
            {t('dashboard.roi')}: {Math.round(savingsFromLossPrevention / (750 * 12))}x
          </strong>
        </p>
      </div>
    </div>
  )
}