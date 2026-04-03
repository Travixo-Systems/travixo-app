'use client'

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowRight, Package, QrCode, TrendingUp } from "lucide-react"
import { useLanguage } from "@/lib/LanguageContext"
import { createTranslator } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/client"
import OnboardingBanner from "@/components/dashboard/OnboardingBanner"

interface CategoryUtilization {
  category: string
  inUse: number
  total: number
  rate: number
}

interface DashboardData {
  firstName: string
  orgName: string
  orgId: string
  onboardingCompleted: boolean
  totalAssets: number
  utilizationRate: number
  recentScans: number
  vgpOverdue: number
  vgpUpcoming: number
  vgpCompliant: number
  upcomingInspections: { id: string; name: string; daysUntil: number }[]
  upcomingReturns: { id: string; name: string; clientName: string; daysUntil: number }[]
  categoryUtilization: CategoryUtilization[]
}

export default function DashboardPage() {
  const { language } = useLanguage()
  const t = createTranslator(language)
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    const check = () => setIsCompact(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Get user profile + org
    const { data: profile } = await supabase
      .from('users')
      .select('first_name, organization_id, organizations(name, onboarding_completed, demo_data_seeded)')
      .eq('id', user.id)
      .single()

    const orgId = profile?.organization_id
    const orgInfo = (profile as unknown as { organizations: { name: string; onboarding_completed: boolean; demo_data_seeded: boolean } | null })?.organizations
    const orgName = orgInfo?.name || ''
    const onboardingCompleted = orgInfo?.onboarding_completed ?? true
    const firstName = (profile as any)?.first_name || ''

    // Auto-trigger onboarding for existing orgs
    if (orgId && orgInfo && !orgInfo.demo_data_seeded) {
      fetch('/api/internal/post-registration', { method: 'POST' }).catch(() => {})
    }

    // Asset counts
    const { count: totalAssets } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId!)
      .is('archived_at', null)

    const { count: inUseAssets } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId!)
      .eq('status', 'in_use')

    const utilizationRate = totalAssets && inUseAssets
      ? Math.round((inUseAssets / totalAssets) * 100)
      : 0

    // Scans (7d)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { count: recentScans } = await supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .gte('scanned_at', sevenDaysAgo.toISOString())

    // VGP schedules
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: vgpSchedules } = await supabase
      .from('vgp_schedules')
      .select('id, next_due_date, assets(id, name)')
      .eq('organization_id', orgId!)
      .is('archived_at', null)
      .order('next_due_date', { ascending: true })

    let vgpOverdue = 0
    let vgpUpcoming = 0
    let vgpCompliant = 0
    const upcomingInspections: { id: string; name: string; daysUntil: number }[] = []

    vgpSchedules?.forEach((s: any) => {
      const days = Math.ceil((new Date(s.next_due_date).getTime() - today.getTime()) / 86_400_000)
      if (days < 0) {
        vgpOverdue++
      } else if (days <= 30) {
        vgpUpcoming++
        if (upcomingInspections.length < 3) {
          upcomingInspections.push({ id: s.id, name: s.assets?.name || 'N/A', daysUntil: days })
        }
      } else {
        vgpCompliant++
      }
    })

    // Upcoming rental returns
    const { data: rentals } = await supabase
      .from('rentals')
      .select('id, client_name, expected_return_date, assets(name)')
      .eq('status', 'active')
      .order('expected_return_date', { ascending: true })
      .limit(3)

    const upcomingReturns = (rentals || []).map((r: any) => {
      const days = r.expected_return_date
        ? Math.ceil((new Date(r.expected_return_date).getTime() - today.getTime()) / 86_400_000)
        : 0
      return { id: r.id, name: r.assets?.name || 'N/A', clientName: r.client_name, daysUntil: days }
    })

    // Per-category utilization
    const { data: assetsWithCat } = await supabase
      .from('assets')
      .select('status, asset_categories(name)')
      .eq('organization_id', orgId!)
      .is('archived_at', null)

    const catMap = new Map<string, { inUse: number; total: number }>()
    ;(assetsWithCat || []).forEach((a: any) => {
      const catName = a.asset_categories?.name || (language === 'fr' ? 'Sans categorie' : 'Uncategorized')
      const entry = catMap.get(catName) || { inUse: 0, total: 0 }
      entry.total++
      if (a.status === 'in_use') entry.inUse++
      catMap.set(catName, entry)
    })

    const categoryUtilization: CategoryUtilization[] = Array.from(catMap.entries())
      .map(([category, { inUse, total }]) => ({
        category,
        inUse,
        total,
        rate: total > 0 ? Math.round((inUse / total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)

    setData({
      firstName,
      orgName,
      orgId: orgId || '',
      onboardingCompleted,
      totalAssets: totalAssets || 0,
      utilizationRate,
      recentScans: recentScans || 0,
      vgpOverdue,
      vgpUpcoming,
      vgpCompliant,
      upcomingInspections,
      upcomingReturns,
      categoryUtilization,
    })
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent, #e8600a)' }} />
      </div>
    )
  }

  if (!data) return null

  const todayStr = new Date().toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const fineRisk = data.vgpOverdue * 15000

  return (
    <div className="space-y-3 sm:space-y-4 min-[1026px]:space-y-5 p-3 md:p-6">
      {/* Onboarding */}
      {data.orgId && (
        <OnboardingBanner organizationId={data.orgId} onboardingCompleted={data.onboardingCompleted} />
      )}

      {/* 1. Header */}
      <div>
        <h1 className="text-[18px] min-[1026px]:text-[22px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
          {t('dashboard.greeting')}{data.firstName ? `, ${data.firstName}` : ''}
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted, #777)' }}>
          {data.orgName} - {todayStr}
        </p>
      </div>

      {/* 2. VGP Alert Banner (only if overdue) */}
      {data.vgpOverdue > 0 && (
        <div
          className="rounded-lg p-2.5 sm:p-4 flex items-start gap-2 sm:gap-3"
          style={{
            backgroundColor: 'rgba(220,38,38,0.06)',
            borderLeft: '3px solid var(--status-retard, #dc2626)',
          }}
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#dc2626' }} />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold" style={{ color: '#dc2626' }}>
              {data.vgpOverdue} {data.vgpOverdue > 1 ? t('dashboard.overdueEquipmentPlural') : t('dashboard.overdueEquipment')}
            </p>
            <p className="text-[13px] mt-0.5" style={{ color: '#991b1b' }}>
              {t('dashboard.fineExposure')}: €{fineRisk.toLocaleString()}
            </p>
          </div>
          <Link
            href="/vgp/schedules?status=overdue"
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white rounded-md min-h-[44px]"
            style={{ backgroundColor: 'var(--status-retard, #dc2626)' }}
          >
            {t('dashboard.handleNow')} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* 3. Three compliance cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <ComplianceCard
          label={t('dashboard.vgpOverdueLabel')}
          count={data.vgpOverdue}
          color="var(--status-retard, #dc2626)"
        />
        <ComplianceCard
          label={t('dashboard.vgpUpcomingLabel')}
          count={data.vgpUpcoming}
          color="var(--status-bientot, #d97706)"
        />
        <ComplianceCard
          label={t('dashboard.compliant')}
          count={data.vgpCompliant}
          color="var(--status-conforme, #059669)"
        />
      </div>

      {/* 4. Two-column section */}
      <div className="grid grid-cols-1 min-[1026px]:grid-cols-2 gap-3">
        {/* Left: Upcoming inspections */}
        <div
          className="rounded-lg p-2 sm:p-4"
          style={{
            backgroundColor: 'var(--card-bg, #edeff2)',
            borderLeft: '3px solid var(--accent, #e8600a)',
            borderBottom: '3px solid var(--accent, #e8600a)',
            borderRadius: '8px 8px 8px 0',
          }}
        >
          <h3 className="text-[11px] sm:text-[13px] font-semibold uppercase tracking-wide mb-2 sm:mb-3" style={{ color: 'var(--text-hint, #888)' }}>
            {t('dashboard.inspectionsThisWeek')}
          </h3>
          {data.upcomingInspections.length === 0 ? (
            <p className="text-[13px] py-4 text-center" style={{ color: 'var(--text-muted, #777)' }}>
              {t('dashboard.noUpcomingInspections')}
            </p>
          ) : (
            <div className="space-y-1 sm:space-y-2">
              {(isCompact ? data.upcomingInspections.slice(0, 2) : data.upcomingInspections).map((insp) => (
                <div key={insp.id} className="flex items-center justify-between min-h-[36px] sm:min-h-[44px]">
                  <span className="text-[13px] sm:text-[14px] font-medium truncate" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                    {insp.name}
                  </span>
                  <span
                    className="text-[11px] sm:text-[12px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ml-2"
                    style={{
                      backgroundColor: insp.daysUntil <= 7 ? 'rgba(220,38,38,0.1)' : 'rgba(217,119,6,0.1)',
                      color: insp.daysUntil <= 7 ? '#dc2626' : '#d97706',
                    }}
                  >
                    {insp.daysUntil}{language === 'fr' ? 'j' : 'd'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link
            href="/vgp/schedules"
            className="inline-flex items-center gap-1 text-[12px] sm:text-[13px] font-medium mt-2 sm:mt-3 transition-colors hover:underline"
            style={{ color: 'var(--accent, #e8600a)' }}
          >
            {t('dashboard.viewSchedules')} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Right: Upcoming returns */}
        <div
          className="rounded-lg p-2 sm:p-4"
          style={{
            backgroundColor: 'var(--card-bg, #edeff2)',
            borderLeft: '3px solid var(--accent, #e8600a)',
            borderBottom: '3px solid var(--accent, #e8600a)',
            borderRadius: '8px 8px 8px 0',
          }}
        >
          <h3 className="text-[11px] sm:text-[13px] font-semibold uppercase tracking-wide mb-2 sm:mb-3" style={{ color: 'var(--text-hint, #888)' }}>
            {t('dashboard.expectedReturns')}
          </h3>
          {data.upcomingReturns.length === 0 ? (
            <p className="text-[13px] py-4 text-center" style={{ color: 'var(--text-muted, #777)' }}>
              {t('dashboard.noUpcomingReturns')}
            </p>
          ) : (
            <div className="space-y-1 sm:space-y-2">
              {(isCompact ? data.upcomingReturns.slice(0, 1) : data.upcomingReturns).map((r) => (
                <div key={r.id} className="flex items-center justify-between min-h-[36px] sm:min-h-[44px]">
                  <div className="min-w-0">
                    <p className="text-[13px] sm:text-[14px] font-medium truncate" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {r.name}
                    </p>
                    <p className="text-[11px] sm:text-[12px]" style={{ color: 'var(--text-muted, #777)' }}>
                      {r.clientName}
                    </p>
                  </div>
                  <span
                    className="text-[11px] sm:text-[12px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ml-2"
                    style={{
                      backgroundColor: r.daysUntil <= 0 ? 'rgba(220,38,38,0.1)' : 'rgba(217,119,6,0.1)',
                      color: r.daysUntil <= 0 ? '#dc2626' : '#d97706',
                    }}
                  >
                    {r.daysUntil <= 0
                      ? (language === 'fr' ? 'En retard' : 'Overdue')
                      : `${r.daysUntil}${language === 'fr' ? 'j' : 'd'}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link
            href="/clients"
            className="inline-flex items-center gap-1 text-[12px] sm:text-[13px] font-medium mt-2 sm:mt-3 transition-colors hover:underline"
            style={{ color: 'var(--accent, #e8600a)' }}
          >
            {t('dashboard.viewRentals')} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* 5. Bottom row - secondary stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-lg p-2 sm:p-4 text-center" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
          <Package className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1" style={{ color: 'var(--text-hint, #888)' }} />
          <p className="text-[18px] sm:text-[22px] font-bold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{data.totalAssets}</p>
          <p className="text-[9px] sm:text-[12px] font-semibold" style={{ color: 'var(--text-muted, #777)' }}>{t('dashboard.totalEquipment')}</p>
        </div>
        <div className="rounded-lg p-2 sm:p-4 text-center" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
          <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1" style={{ color: 'var(--text-hint, #888)' }} />
          <p className="text-[18px] sm:text-[22px] font-bold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{data.utilizationRate}%</p>
          <p className="text-[9px] sm:text-[12px] font-semibold" style={{ color: 'var(--text-muted, #777)' }}>{t('dashboard.utilization')}</p>
        </div>
        <div className="rounded-lg p-2 sm:p-4 text-center" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
          <QrCode className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1" style={{ color: 'var(--text-hint, #888)' }} />
          <p className="text-[18px] sm:text-[22px] font-bold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{data.recentScans}</p>
          <p className="text-[9px] sm:text-[12px] font-semibold" style={{ color: 'var(--text-muted, #777)' }}>{t('dashboard.scans7Days')}</p>
        </div>
      </div>

      {/* 6. Per-category utilization */}
      {data.categoryUtilization.length > 0 && (
        <div
          className="rounded-lg p-2.5 sm:p-4"
          style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}
        >
          <h3 className="text-[11px] sm:text-[13px] font-semibold uppercase tracking-wide mb-2 sm:mb-3" style={{ color: 'var(--text-hint, #888)' }}>
            {t('dashboard.categoryUtilization')}
          </h3>
          <div className="space-y-2 sm:space-y-2.5">
            {data.categoryUtilization.map((cat) => (
              <div key={cat.category}>
                <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                  <span className="text-[12px] sm:text-[13px] font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                    {cat.category}
                  </span>
                  <span className="text-[11px] sm:text-[12px] font-semibold" style={{ color: 'var(--text-muted, #777)' }}>
                    {cat.inUse}/{cat.total} ({cat.rate}%)
                  </span>
                </div>
                <div className="h-1.5 sm:h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.08)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${cat.rate}%`,
                      backgroundColor: cat.rate >= 50 ? 'var(--accent, #e8600a)' : 'var(--text-hint, #888)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compliance card with L + bottom accent border ──
function ComplianceCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
      className="rounded-lg p-2 sm:p-4"
      style={{
        backgroundColor: 'var(--card-bg, #edeff2)',
        borderLeft: `3px solid ${color}`,
        borderBottom: `3px solid ${color}`,
        borderRadius: '8px 8px 8px 0',
      }}
    >
      <p className="text-[22px] sm:text-[30px] font-bold leading-none" style={{ color }}>{count}</p>
      <p className="text-[10px] sm:text-[13px] font-semibold mt-0.5 sm:mt-1" style={{ color: 'var(--text-secondary, #444)' }}>{label}</p>
    </div>
  )
}
