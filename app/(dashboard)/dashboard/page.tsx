'use client'

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowRight, Package, QrCode, TrendingUp } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useLanguage } from "@/lib/LanguageContext"
import { createTranslator } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/client"
import OnboardingBanner from "@/components/dashboard/OnboardingBanner"
import StatusBadge from "@/components/ui/StatusBadge"
import { useCountUp } from "@/lib/hooks/useCountUp"

interface CategoryUtilization {
  category: string
  categoryId: string | null
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
  activeRentalCount: number
  overdueReturns: number
  upcomingInspections: { id: string; assetId: string | null; name: string; daysUntil: number }[]
  upcomingReturns: { id: string; assetId: string; name: string; clientName: string; daysUntil: number }[]
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

    // Scans (7d)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // VGP schedules
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // These seven reads depend only on orgId, which is resolved above. Issuing
    // them together turns seven serial round trips into one wall-clock wait.
    // Nothing below reads another's result -- every derived figure is computed
    // from the settled values, so ordering here carries no meaning.
    const [
      { count: totalAssets },
      { count: inUseAssets },
      { count: recentScans },
      { data: vgpSchedules },
      { data: allActiveRentals },
      { data: rentals },
      { data: assetsWithCat },
    ] = await Promise.all([
      supabase
        .from('assets')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId!)
        .is('archived_at', null),

      // Must exclude archived assets exactly like totalAssets above: archiving a
      // rented-out machine would otherwise push utilization above 100%.
      supabase
        .from('assets')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId!)
        .is('archived_at', null)
        .eq('status', 'in_use'),

      supabase
        .from('scans')
        .select('*', { count: 'exact', head: true })
        .gte('scanned_at', sevenDaysAgo.toISOString()),

      // Completed schedules are excluded: a finished inspection must not keep
      // counting toward "overdue".
      supabase
        .from('vgp_schedules')
        .select('id, next_due_date, assets(id, name)')
        .eq('organization_id', orgId!)
        .is('archived_at', null)
        .neq('status', 'completed')
        .order('next_due_date', { ascending: true }),

      // Rental returns. Fetched in full (not just the 3 shown) so the widget can
      // report how many are outstanding and how many are already late, rather
      // than silently implying there are only three.
      supabase
        .from('rentals')
        .select('expected_return_date')
        .eq('organization_id', orgId!)
        .eq('status', 'active'),

      supabase
        .from('rentals')
        .select('id, asset_id, client_name, expected_return_date, assets(name)')
        .eq('organization_id', orgId!)
        .eq('status', 'active')
        .order('expected_return_date', { ascending: true })
        .limit(3),

      // Per-category utilization. category_id is carried through so each bar can
      // link to the matching filter on the assets page.
      supabase
        .from('assets')
        .select('status, category_id, asset_categories(name)')
        .eq('organization_id', orgId!)
        .is('archived_at', null),
    ])

    const utilizationRate = totalAssets && inUseAssets
      ? Math.round((inUseAssets / totalAssets) * 100)
      : 0

    let vgpOverdue = 0
    let vgpUpcoming = 0
    let vgpCompliant = 0
    const upcomingInspections: { id: string; assetId: string | null; name: string; daysUntil: number }[] = []

    vgpSchedules?.forEach((s: any) => {
      const days = Math.ceil((new Date(s.next_due_date).getTime() - today.getTime()) / 86_400_000)
      if (days < 0) {
        vgpOverdue++
      } else if (days <= 30) {
        vgpUpcoming++
        if (upcomingInspections.length < 3) {
          upcomingInspections.push({
            id: s.id,
            assetId: s.assets?.id || null,
            name: s.assets?.name || 'N/A',
            daysUntil: days,
          })
        }
      } else {
        vgpCompliant++
      }
    })

    const activeRentalCount = (allActiveRentals || []).length
    const overdueReturns = (allActiveRentals || []).filter(
      (r) => r.expected_return_date && new Date(r.expected_return_date) < today
    ).length

    const upcomingReturns = (rentals || []).map((r: any) => {
      const days = r.expected_return_date
        ? Math.ceil((new Date(r.expected_return_date).getTime() - today.getTime()) / 86_400_000)
        : 0
      return {
        id: r.id,
        assetId: r.asset_id,
        name: r.assets?.name || 'N/A',
        clientName: r.client_name,
        daysUntil: days,
      }
    })

    const catMap = new Map<string, { categoryId: string | null; inUse: number; total: number }>()
    ;(assetsWithCat || []).forEach((a: any) => {
      const catName = a.asset_categories?.name || (language === 'fr' ? 'Sans categorie' : 'Uncategorized')
      const entry = catMap.get(catName) || { categoryId: a.category_id || null, inUse: 0, total: 0 }
      entry.total++
      if (a.status === 'in_use') entry.inUse++
      catMap.set(catName, entry)
    })

    const categoryUtilization: CategoryUtilization[] = Array.from(catMap.entries())
      .map(([category, { categoryId, inUse, total }]) => ({
        category,
        categoryId,
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
      activeRentalCount,
      overdueReturns,
      upcomingInspections,
      upcomingReturns,
      categoryUtilization,
    })
    setLoading(false)
  }

  if (loading) return <DashboardSkeleton />

  if (!data) return null

  const todayStr = new Date().toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="space-y-3 sm:space-y-4 min-[1026px]:space-y-5 p-3 md:p-6 animate-enter">
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
            <p className="text-[14px] font-semibold" style={{ color: '#991b1b' }}>
              {data.vgpOverdue} {data.vgpOverdue > 1 ? t('dashboard.overdueEquipmentPlural') : t('dashboard.overdueEquipment')}
            </p>
            <p className="text-[13px] mt-0.5" style={{ color: '#991b1b' }}>
              {t('dashboard.vgpRiskSanctions')}
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
          href="/vgp/schedules?status=overdue"
        />
        <ComplianceCard
          label={t('dashboard.vgpUpcomingLabel')}
          count={data.vgpUpcoming}
          color="var(--status-bientot, #d97706)"
          href="/vgp/schedules?status=upcoming"
        />
        {/* No link: this is reassurance, not a task. Nothing needs doing about
            equipment that is compliant. */}
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
              {(isCompact ? data.upcomingInspections.slice(0, 2) : data.upcomingInspections).map((insp) => {
                const rowClass = 'flex items-center justify-between min-h-[36px] sm:min-h-[44px] -mx-2 px-2 rounded-md'
                const body = (
                  <>
                    <span className="text-[13px] sm:text-[14px] font-medium truncate" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {insp.name}
                    </span>
                    <StatusBadge
                      tone={insp.daysUntil <= 7 ? 'retard' : 'bientot'}
                      hideIcon
                      className="flex-shrink-0 ml-2 tabular-nums"
                    >
                      {insp.daysUntil}{language === 'fr' ? 'j' : 'd'}
                    </StatusBadge>
                  </>
                )

                // Whole row is the target. Schedules with no asset joined stay
                // static rather than linking to /assets/null.
                return insp.assetId ? (
                  <Link
                    key={insp.id}
                    href={`/assets/${insp.assetId}`}
                    className={`${rowClass} hover:bg-black/[0.04] transition-colors`}
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={insp.id} className={rowClass}>{body}</div>
                )
              })}
            </div>
          )}
          <Link
            href="/vgp/schedules"
            className="inline-flex items-center gap-1 text-[12px] sm:text-[13px] font-medium mt-2 sm:mt-3 transition-colors hover:underline"
            style={{ color: 'var(--accent-text, #b04a06)' }}
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
                // Whole row is one link: a partially-clickable row produces dead
                // clicks for field users. Targets the asset, where the return
                // action lives; the client is reachable from there.
                <Link
                  key={r.id}
                  href={`/assets/${r.assetId}`}
                  className="flex items-center justify-between min-h-[36px] sm:min-h-[44px] -mx-2 px-2 rounded-md hover:bg-black/[0.04] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] sm:text-[14px] font-medium truncate" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {r.name}
                    </p>
                    <p className="text-[11px] sm:text-[12px] truncate" style={{ color: 'var(--text-muted, #777)' }}>
                      {r.clientName}
                    </p>
                  </div>
                  <StatusBadge
                    tone={r.daysUntil <= 0 ? 'retard' : 'bientot'}
                    hideIcon={r.daysUntil > 0}
                    className="flex-shrink-0 ml-2 tabular-nums"
                  >
                    {r.daysUntil <= 0
                      ? (language === 'fr' ? 'En retard' : 'Overdue')
                      : `${r.daysUntil}${language === 'fr' ? 'j' : 'd'}`}
                  </StatusBadge>
                </Link>
              ))}
            </div>
          )}
          <Link
            href="/assets?status=in_use"
            className="inline-flex items-center gap-1 text-[12px] sm:text-[13px] font-medium mt-2 sm:mt-3 transition-colors hover:underline"
            style={{ color: 'var(--accent-text, #b04a06)' }}
          >
            {t('dashboard.viewRentals')}
            {data.activeRentalCount > 0 && ` (${data.activeRentalCount})`}
            <ArrowRight className="w-3 h-3" />
          </Link>

          {/* Equipment already past its return date. Without this the widget
              shows at most 3 rows and reads as if only 3 are outstanding. */}
          {data.overdueReturns > 0 && (
            <p className="text-[11px] sm:text-[12px] mt-1.5 font-medium" style={{ color: '#dc2626' }}>
              {data.overdueReturns} {t('dashboard.ofWhichOverdue')}
            </p>
          )}
        </div>
      </div>

      {/* 5. Bottom row - secondary stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile
          icon={Package}
          value={data.totalAssets}
          label={t('dashboard.totalEquipment')}
          href="/assets"
        />
        {/* No link: a health indicator, not a to-do. */}
        <StatTile
          icon={TrendingUp}
          value={`${data.utilizationRate}%`}
          label={t('dashboard.utilization')}
        />
        <StatTile
          icon={QrCode}
          value={data.recentScans}
          label={t('dashboard.scans7Days')}
          href="/scans"
        />
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
            {data.categoryUtilization.map((cat) => {
              const body = (
                <>
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
                </>
              )

              // Label and bar are one target. Uncategorised assets have no id to
              // filter by, so that row stays static rather than linking to a
              // filter that would match nothing.
              return cat.categoryId ? (
                <Link
                  key={cat.category}
                  href={`/assets?category=${cat.categoryId}`}
                  className="block -mx-2 px-2 py-1 rounded-md hover:bg-black/[0.04] transition-colors"
                >
                  {body}
                </Link>
              ) : (
                <div key={cat.category} className="-mx-2 px-2 py-1">{body}</div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Loading state for the dashboard.
 *
 * Deliberately mirrors the real layout - same grids, same card heights - so
 * content replaces the placeholder in place instead of the page reflowing.
 * The dashboard issues several sequential queries; a shaped skeleton reports
 * progress where a centred spinner only reports waiting.
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-3 sm:space-y-4 min-[1026px]:space-y-5 p-3 md:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement du tableau de bord</span>

      <div className="space-y-2">
        <div className="skeleton h-6 w-56" />
        <div className="skeleton h-4 w-72" />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-[86px] sm:h-[104px]" />
        ))}
      </div>

      <div className="grid grid-cols-1 min-[1026px]:grid-cols-2 gap-3">
        <div className="skeleton h-[188px]" />
        <div className="skeleton h-[188px]" />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-[84px] sm:h-[96px]" />
        ))}
      </div>

      <div className="skeleton h-[150px]" />
    </div>
  )
}

// ── Secondary stat tile ──
// `href` is optional by design. A metric only links when there is something to
// do about it; a reassurance figure stays inert and drops the hover affordance,
// so the row does not train the user to click numbers that lead nowhere.
function StatTile({
  icon: Icon,
  value,
  label,
  href,
}: {
  icon: LucideIcon
  value: number | string
  label: string
  href?: string
}) {
  // `value` may carry a unit ("23%"); animate the number and keep the suffix.
  const numeric = typeof value === 'number' ? value : parseInt(value, 10)
  const suffix = typeof value === 'number' ? '' : value.replace(/^-?\d+/, '')
  const shown = useCountUp(Number.isNaN(numeric) ? 0 : numeric)

  const body = (
    <>
      <Icon className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1" style={{ color: 'var(--text-hint, #888)' }} />
      <p className="text-[18px] sm:text-[22px] font-bold tabular-nums" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
        {Number.isNaN(numeric) ? value : `${shown}${suffix}`}
      </p>
      <p className="text-[9px] sm:text-[12px] font-semibold" style={{ color: 'var(--text-muted, #777)' }}>{label}</p>
    </>
  )
  const base = 'block rounded-lg p-2 sm:p-4 text-center'
  const style = { backgroundColor: 'var(--card-bg, #edeff2)' }

  if (!href) {
    return <div className={base} style={style}>{body}</div>
  }

  return (
    <Link href={href} className={`${base} card-lift hover:bg-black/[0.04]`} style={style}>
      {body}
    </Link>
  )
}

// ── Compliance card with L + bottom accent border ──
// Overdue and upcoming link out: they are the dashboard's calls to action, so
// every part of them must be tappable. "Compliant" is reassurance, not a task,
// and is rendered without a link (see `href` note on StatTile).
function ComplianceCard({
  label,
  count,
  color,
  href,
}: {
  label: string
  count: number
  color: string
  href?: string
}) {
  const shown = useCountUp(count)
  const body = (
    <>
      <p className="text-[22px] sm:text-[30px] font-bold leading-none tabular-nums" style={{ color }}>{shown}</p>
      <p className="text-[10px] sm:text-[13px] font-semibold mt-0.5 sm:mt-1" style={{ color: 'var(--text-secondary, #444)' }}>{label}</p>
    </>
  )
  const base = 'block rounded-lg p-2 sm:p-4'
  const style = {
    backgroundColor: 'var(--card-bg, #edeff2)',
    borderLeft: `3px solid ${color}`,
    borderBottom: `3px solid ${color}`,
    borderRadius: '8px 8px 8px 0',
  }

  if (!href) {
    return <div className={base} style={style}>{body}</div>
  }

  return (
    <Link href={href} className={`${base} card-lift hover:bg-black/[0.04]`} style={style}>
      {body}
    </Link>
  )
}
