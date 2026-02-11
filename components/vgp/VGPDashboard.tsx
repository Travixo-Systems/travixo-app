'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Calendar, FileText, TrendingUp, ArrowRight } from 'lucide-react';
import FeatureGate from '@/components/subscription/FeatureGate';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';
import { VGPReadOnlyBanner } from './VGPUpgradeOverlay';
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {isReadOnly && <VGPReadOnlyBanner />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('vgpDashboard.pageTitle')}</h1>
          <p className="text-gray-600 mt-1">
            {t('vgpDashboard.pageSubtitle')}
          </p>
        </div>
        {!isReadOnly && (
          <button
            onClick={() => (window.location.href = '/vgp/report')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
          className="bg-white rounded-lg shadow p-6 border-l-4 border-b-4 border-t border-r border-gray-200 hover:shadow-lg transition-all cursor-pointer"
          style={{ borderLeftColor: '#047857', borderBottomColor: '#047857' }}
        >
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <span className="text-2xl font-bold text-green-600">
              {summary?.compliance_rate || 0}%
            </span>
          </div>
          <h3 className="text-sm font-semibold text-gray-700">{t('vgpDashboard.complianceRate')}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {summary?.compliant_assets || 0} {t('vgpDashboard.compliantEquipment')}
          </p>
        </div>

        {/* Upcoming - Yellow */}
        <div
          onClick={() => (window.location.href = '/vgp/schedules?status=upcoming')}
          className="bg-white rounded-lg shadow p-6 border-l-4 border-b-4 border-t border-r border-gray-200 hover:shadow-lg transition-all cursor-pointer"
          style={{ borderLeftColor: '#eab308', borderBottomColor: '#eab308' }}
        >
          <div className="flex items-center justify-between mb-2">
            <Calendar className="w-8 h-8 text-yellow-600" />
            <span className="text-2xl font-bold text-yellow-600">{upcoming.length}</span>
          </div>
          <h3 className="text-sm font-semibold text-gray-700">{t('vgpDashboard.upcoming')}</h3>
          <p className="text-xs text-gray-500 mt-1">{t('vgpDashboard.plannedInspections')}</p>
        </div>

        {/* Overdue - Red */}
        <div
          onClick={() => (window.location.href = '/vgp/schedules?status=overdue')}
          className="bg-white rounded-lg shadow p-6 border-l-4 border-b-4 border-t border-r border-gray-200 hover:shadow-lg transition-all cursor-pointer"
          style={{ borderLeftColor: '#b91c1c', borderBottomColor: '#b91c1c' }}
        >
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-8 h-8 text-red-600" />
            <span className="text-2xl font-bold text-red-600">{overdue.length}</span>
          </div>
          <h3 className="text-sm font-semibold text-gray-700">{t('vgpDashboard.overdue')}</h3>
          <p className="text-xs text-gray-500 mt-1">{t('vgpDashboard.immediateAction')}</p>
        </div>

        {/* Total Equipment - Gray */}
        <div
          onClick={() => (window.location.href = '/vgp/schedules')}
          className="bg-white rounded-lg shadow p-6 border-l-4 border-b-4 border-t border-r border-gray-200 hover:shadow-lg transition-all cursor-pointer"
          style={{ borderLeftColor: '#6b7280', borderBottomColor: '#6b7280' }}
        >
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 text-gray-600" />
            <span className="text-2xl font-bold text-gray-600">
              {totalEquipments}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-gray-700">{t('vgpDashboard.totalEquipment')}</h3>
          <p className="text-xs text-gray-500 mt-1">{t('vgpDashboard.underVGPMonitoring')}</p>
        </div>
      </div>

      {/* OVERDUE Section */}
      {overdue.length > 0 && (
        <div 
          className="bg-white rounded-lg shadow-sm p-4 border-t-[5px] border-r-[5px] border-l border-b border-gray-200"
          style={{ borderTopColor: '#b91c1c', borderRightColor: '#b91c1c' }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h2 className="text-base font-bold text-red-900">
              {t('vgpDashboard.overdueSection')} ({overdue.length}) - {t('vgpDashboard.risk')}: €{financialRiskMin.toLocaleString()}-€{financialRiskMax.toLocaleString()}
            </h2>
          </div>

          {/* Compact rows */}
          <div className="space-y-2">
            {overdue.slice(0, 4).map((schedule) => {
              const daysOverdue = Math.abs(getDaysUntil(schedule.next_due_date));
              return (
                <div key={schedule.id} className="flex items-center justify-between text-sm py-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium text-gray-900 truncate">
                      {schedule.assets?.name || 'N/A'}
                    </span>
                    <span className="text-xs text-gray-500">
                      #{schedule.assets?.serial_number || 'N/A'}
                    </span>
                  </div>
                  <div className="flex-shrink-0">
                    <span className="text-red-600 font-semibold">{daysOverdue}j</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* View more button */}
          {overdue.length > 4 && (
            <button
              onClick={() => window.location.href = '/vgp/schedules?status=overdue'}
              className="mt-3 w-full py-2 px-4 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm font-medium text-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              + {overdue.length - 4} {t('vgpDashboard.otherEquipment')} • {t('vgpDashboard.viewAll')}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* UPCOMING Section */}
      {upcoming.length > 0 && (
        <div 
          className="bg-white rounded-lg shadow-sm p-4 border-t-[5px] border-r-[5px] border-l border-b border-gray-200"
          style={{ borderTopColor: '#eab308', borderRightColor: '#eab308' }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5 text-yellow-600" />
            <h2 className="text-base font-bold text-gray-900">
              {t('vgpDashboard.upcomingSection')} ({upcoming.length}) - {t('vgpDashboard.next30Days')}
            </h2>
          </div>

          {/* Compact rows */}
          <div className="space-y-2">
            {upcoming.slice(0, 3).map((schedule) => {
              const daysUntil = getDaysUntil(schedule.next_due_date);
              return (
                <div key={schedule.id} className="flex items-center justify-between text-sm py-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium text-gray-900 truncate">
                      {schedule.assets?.name || 'N/A'}
                    </span>
                  </div>
                  <div className="flex-shrink-0">
                    <span className="text-gray-600 text-xs">{t('vgpDashboard.in')} {daysUntil}j</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* View more button */}
          {upcoming.length > 3 && (
            <button
              onClick={() => window.location.href = '/vgp/schedules?status=upcoming'}
              className="mt-3 w-full py-2 px-4 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm font-medium text-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              {t('vgpDashboard.viewAllInTracking')}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}