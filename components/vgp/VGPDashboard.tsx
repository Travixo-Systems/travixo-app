'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Calendar, FileText, TrendingUp, ArrowRight } from 'lucide-react';
import FeatureGate from '@/components/subscription/FeatureGate';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';
import { VGPReadOnlyBanner } from './VGPUpgradeOverlay';
import { VGPCountdownPill } from './VGPStatusBadge';
import { useVGPAccess } from '@/hooks/useSubscription';

export default function VGPComplianceDashboard() {
  return (
    <FeatureGate feature="vgp_compliance">
      <VGPContent />
    </FeatureGate>
  );
}

function VGPContent() {
  const { language } = useLanguage();
  const t = createTranslator(language);
  const { access: vgpAccess } = useVGPAccess();
  const isReadOnly = vgpAccess === 'read_only';

  const [summary, setSummary] = useState<any>(null);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchComplianceData();
  }, []);

  const fetchComplianceData = async () => {
    try {
      const res = await fetch('/api/vgp/compliance-summary');
      const data = await res.json();

      setSummary(data.summary || {});
      setUpcoming(Array.isArray(data.upcoming) ? data.upcoming : []);
      setOverdue(Array.isArray(data.overdue) ? data.overdue : []);
    } catch {
      setSummary({});
      setUpcoming([]);
      setOverdue([]);
    } finally {
      setLoading(false);
    }
  };

  const getDaysUntil = (dateString: string) => {
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const totalEquipments = summary?.total_assets_with_vgp || 0;

  // Calculate financial risk
  const financialRiskMin = overdue.length * 3000;
  const financialRiskMax = overdue.length * 15000;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#e8600a]"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {isReadOnly && <VGPReadOnlyBanner />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('vgpDashboard.pageTitle')}</h1>
          <p className="mt-1" style={{ color: 'var(--text-muted, #777)' }}>
            {t('vgpDashboard.pageSubtitle')}
          </p>
        </div>
        {!isReadOnly && (
          <button
            onClick={() => (window.location.href = '/vgp/report')}
            className="flex items-center gap-2 px-4 py-2 rounded-md transition-colors hover:opacity-90"
            style={{ backgroundColor: 'var(--card-bg, #edeff2)', color: 'var(--text-primary, #1a1a1a)', border: '0.5px solid #b8b8b8' }}
          >
            <FileText className="w-4 h-4" />
            {t('vgpDashboard.generateReport')}
          </button>
        )}
      </div>

      {/* 4 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Compliance Rate - Green */}
        <div
          onClick={() => (window.location.href = '/vgp/schedules')}
          className="rounded-lg p-[14px_16px] border-l-[3px] hover:opacity-90 transition-all cursor-pointer"
          style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderLeftColor: 'var(--status-conforme, #059669)' }}
        >
          <span className="text-[26px] font-medium" style={{ color: 'var(--status-conforme, #059669)' }}>
            {summary?.compliance_rate || 0}%
          </span>
          <h3 className="text-xs font-medium mt-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('vgpDashboard.complianceRate')}</h3>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
            {summary?.compliant_assets || 0} {t('vgpDashboard.compliantEquipment')}
          </p>
        </div>

        {/* Upcoming - Amber */}
        <div
          onClick={() => (window.location.href = '/vgp/schedules?status=upcoming')}
          className="rounded-lg p-[14px_16px] border-l-[3px] hover:opacity-90 transition-all cursor-pointer"
          style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderLeftColor: 'var(--status-bientot, #d97706)' }}
        >
          <span className="text-[26px] font-medium" style={{ color: 'var(--status-bientot, #d97706)' }}>{upcoming.length}</span>
          <h3 className="text-xs font-medium mt-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('vgpDashboard.upcoming')}</h3>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>{t('vgpDashboard.plannedInspections')}</p>
        </div>

        {/* Overdue - Red */}
        <div
          onClick={() => (window.location.href = '/vgp/schedules?status=overdue')}
          className="rounded-lg p-[14px_16px] border-l-[3px] hover:opacity-90 transition-all cursor-pointer"
          style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderLeftColor: 'var(--status-retard, #dc2626)' }}
        >
          <span className="text-[26px] font-medium" style={{ color: 'var(--status-retard, #dc2626)' }}>{overdue.length}</span>
          <h3 className="text-xs font-medium mt-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('vgpDashboard.overdue')}</h3>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>{t('vgpDashboard.immediateAction')}</p>
        </div>

        {/* Total Equipment - Neutral */}
        <div
          onClick={() => (window.location.href = '/vgp/schedules')}
          className="rounded-lg p-[14px_16px] border-l-[3px] hover:opacity-90 transition-all cursor-pointer"
          style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderLeftColor: 'var(--status-neutral, #6b7280)' }}
        >
          <span className="text-[26px] font-medium" style={{ color: 'var(--status-neutral, #6b7280)' }}>
            {totalEquipments}
          </span>
          <h3 className="text-xs font-medium mt-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('vgpDashboard.totalEquipment')}</h3>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>{t('vgpDashboard.underVGPMonitoring')}</p>
        </div>
      </div>

      {/* OVERDUE Section */}
      {overdue.length > 0 && (
        <div
          className="rounded-lg p-4 border-l-[3px]"
          style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderLeftColor: 'var(--status-retard, #dc2626)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[13px] font-medium" style={{ color: 'var(--status-retard, #dc2626)' }}>
              {t('vgpDashboard.overdueSection')} ({overdue.length}) - {t('vgpDashboard.risk')}: €{financialRiskMin.toLocaleString()}-€{financialRiskMax.toLocaleString()}
            </h2>
          </div>

          <div className="divide-y" style={{ borderColor: '#dcdee3' }}>
            {overdue.slice(0, 4).map((schedule) => {
              const daysOverdue = Math.abs(getDaysUntil(schedule.next_due_date));
              return (
                <div key={schedule.id} className="flex items-center justify-between text-[13px] py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium truncate" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {schedule.assets?.name || 'N/A'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-hint, #888)' }}>
                      #{schedule.assets?.serial_number || 'N/A'}
                    </span>
                  </div>
                  <div className="flex-shrink-0">
                    <span className="text-white text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--status-retard, #dc2626)' }}>{daysOverdue}j</span>
                  </div>
                </div>
              );
            })}
          </div>

          {overdue.length > 4 && (
            <button
              onClick={() => window.location.href = '/vgp/schedules?status=overdue'}
              className="mt-3 text-xs font-medium transition-colors"
              style={{ color: 'var(--accent, #e8600a)' }}
            >
              {t('vgpDashboard.viewAll')} →
            </button>
          )}
        </div>
      )}

      {/* UPCOMING Section */}
      {upcoming.length > 0 && (
        <div
          className="rounded-lg p-4 border-l-[3px]"
          style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderLeftColor: 'var(--status-bientot, #d97706)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[13px] font-medium" style={{ color: 'var(--status-bientot, #d97706)' }}>
              {t('vgpDashboard.upcomingSection')} ({upcoming.length}) - {t('vgpDashboard.next30Days')}
            </h2>
          </div>

          <div className="divide-y" style={{ borderColor: '#dcdee3' }}>
            {upcoming.slice(0, 3).map((schedule) => {
              const daysUntil = getDaysUntil(schedule.next_due_date);
              return (
                <div key={schedule.id} className="flex items-center justify-between text-[13px] py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium truncate" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {schedule.assets?.name || 'N/A'}
                    </span>
                  </div>
                  <div className="flex-shrink-0">
                    <VGPCountdownPill daysUntil={daysUntil} />
                  </div>
                </div>
              );
            })}
          </div>

          {upcoming.length > 3 && (
            <button
              onClick={() => window.location.href = '/vgp/schedules?status=upcoming'}
              className="mt-3 text-xs font-medium transition-colors"
              style={{ color: 'var(--accent, #e8600a)' }}
            >
              {t('vgpDashboard.viewAllInTracking')} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}