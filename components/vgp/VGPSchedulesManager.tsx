'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Calendar, Search, Archive, Eye, Edit, AlertCircle, CheckCircle, Clock, X,
} from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator, Language } from '@/lib/i18n';
import { EditScheduleModal } from './EditScheduleModal';
import FeatureGate from '@/components/subscription/FeatureGate';
import { VGPReadOnlyBanner } from './VGPUpgradeOverlay';
import { useVGPAccess } from '@/hooks/useSubscription';

// ============================================================================
// B2B PROFESSIONAL BRAND COLORS (Org-Modular)
// ============================================================================

const BRAND_COLORS = {
  primary: '#0a2730',     // Sidebar bg
  danger: '#dc2626',      // --status-retard
  warning: '#d97706',     // --status-bientot
  warningYellow: '#d97706', // Same as warning per spec
  success: '#059669',     // --status-conforme
} as const;

// Org-modular: Toggle between bordered cards or filled cards
const CARD_STYLE = 'bordered'; // 'bordered' | 'filled'

// ============================================================================
// TYPES
// ============================================================================

interface Asset {
  id: string;
  name: string;
  serial_number: string;
  current_location: string;
  qr_code: string;
  asset_categories?: { name: string } | null;
}

interface Schedule {
  id: string;
  asset_id: string;
  interval_months: number;
  last_inspection_date: string | null;
  next_due_date: string;
  inspector_name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  archived_at?: string | null;
  assets: Asset;
}

// 4-card layout - removed total
type StatusFilter = 'all' | 'overdue' | 'upcoming' | 'soon' | 'compliant';

// ============================================================================
// DATE UTILITIES
// ============================================================================

function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function todayStart(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function daysUntilDue(nextDueISO: string): number {
  const due = parseDateOnly(nextDueISO);
  const today = todayStart();
  const diffMs = due.getTime() - today.getTime();
  return Math.ceil(diffMs / 86_400_000);
}

// Must match dashboard
function deriveStatus(nextDueISO: string): StatusFilter {
  const days = daysUntilDue(nextDueISO);
  if (days < 0) return 'overdue';
  if (days <= 30) return 'upcoming';
  if (days <= 90) return 'soon';
  return 'compliant';
}

function formatDateFR(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parseDateOnly(iso));
  } catch {
    return iso;
  }
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

function StatusBadge({ status, t }: { status: StatusFilter; t: (key: string) => string }) {
  const config: Record<StatusFilter, { key: string; bg: string; text: string }> = {
    all: { key: 'vgpSchedules.all', bg: 'bg-slate-100', text: 'text-slate-800' },
    overdue: { key: 'vgpSchedules.overdue', bg: 'bg-red-100', text: 'text-red-800' },
    upcoming: { key: 'vgpSchedules.upcoming', bg: 'bg-yellow-100', text: 'text-yellow-800' },
    soon: { key: 'vgpSchedules.soon', bg: 'bg-orange-100', text: 'text-orange-800' },
    compliant: { key: 'vgpSchedules.compliant', bg: 'bg-green-100', text: 'text-green-800' },
  };

  const { key, bg, text } = config[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[13px] font-semibold ${bg} ${text}`}>
      {t(key)}
    </span>
  );
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-6 py-3 rounded-lg shadow-lg animate-slide-in ${
      type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
    }`}>
      <div className={`${type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
        {type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      </div>
      <p className={`font-medium text-[15px] ${type === 'success' ? 'text-green-900' : 'text-red-900'}`}>{message}</p>
      <button onClick={onClose} className="ml-2 text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function VGPSchedulesContent({ language, t }: { language: Language; t: (key: string) => string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { access: vgpAccess } = useVGPAccess();
  const isReadOnly = vgpAccess === 'read_only';

  // Data
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // UI state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const fetchCtrl = useRef<AbortController | null>(null);

  // Initialize filter from URL
  useEffect(() => {
    const urlStatus = searchParams.get('status') as StatusFilter;
    if (urlStatus && ['overdue', 'upcoming', 'compliant'].includes(urlStatus)) {
      setStatusFilter(urlStatus);
    }
  }, [searchParams]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch schedules
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        if (fetchCtrl.current) fetchCtrl.current.abort();
        fetchCtrl.current = new AbortController();

        const res = await fetch('/api/vgp/schedules?include_archived=false&limit=1000', {
          signal: fetchCtrl.current.signal,
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        const json = await res.json();
        const allSchedules: Schedule[] = (json?.schedules || []).filter((s: any) => !s.archived_at);

        setSchedules(allSchedules);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        console.error('Fetch schedules error:', e);
        setError(e?.message || t('vgpSchedules.error.loadingFailed'));
        setSchedules([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  // Calculate summary stats
  const summary = useMemo(() => {
    const counts = {
      overdue: 0,
      upcoming: 0,
      soon: 0,
      compliant: 0,
    };

    for (const schedule of schedules) {
      const status = deriveStatus(schedule.next_due_date);
      if (status !== 'all') counts[status]++;
    }

    return counts;
  }, [schedules]);

  // Filter schedules
  const filteredSchedules = useMemo(() => {
    let filtered = schedules;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(s => deriveStatus(s.next_due_date) === statusFilter);
    }

    if (debouncedSearch) {
      const query = debouncedSearch;
      filtered = filtered.filter(s => 
        s.assets?.name?.toLowerCase().includes(query) ||
        s.assets?.serial_number?.toLowerCase().includes(query) ||
        s.assets?.current_location?.toLowerCase().includes(query) ||
        s.assets?.asset_categories?.name?.toLowerCase().includes(query) ||
        s.notes?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [schedules, statusFilter, debouncedSearch]);

  // Update URL when filter changes
  const handleFilterChange = (newStatus: StatusFilter) => {
    setStatusFilter(newStatus);
    
    const params = new URLSearchParams(searchParams.toString());
    if (newStatus === 'all') {
      params.delete('status');
    } else {
      params.set('status', newStatus);
    }
    
    const newUrl = params.toString() ? `?${params.toString()}` : '';
    router.push(`/vgp/schedules${newUrl}`, { scroll: false });
  };

  // Archive schedule
  const handleArchive = async (scheduleId: string) => {
    const reason = prompt(t('vgpSchedules.archiveReason'));
    if (!reason?.trim()) return;

    try {
      const res = await fetch(`/api/vgp/schedules/${scheduleId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || t('vgpSchedules.error.archiveFailed'));
      }

      setSchedules(prev => prev.filter(s => s.id !== scheduleId));
      setToast({ message: t('vgpSchedules.success.archived'), type: 'success' });
    } catch (e: any) {
      console.error('Archive error:', e);
      setToast({ message: e?.message || t('vgpSchedules.error.archiveError'), type: 'error' });
    }
  };

  // Edit schedule
  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setShowEdit(true);
  };

  const handleEditSuccess = async () => {
    setShowEdit(false);
    setEditingSchedule(null);
    setToast({ message: t('vgpSchedules.success.updated'), type: 'success' });
    
    try {
      const res = await fetch('/api/vgp/schedules?include_archived=false&limit=1000');
      if (res.ok) {
        const json = await res.json();
        const allSchedules: Schedule[] = (json?.schedules || []).filter((s: any) => !s.archived_at);
        setSchedules(allSchedules);
      }
    } catch (e) {
      console.error('Refetch error:', e);
    }
  };

  return (
    <div className="p-8 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('vgpSchedules.pageTitle')}</h1>
        <p className="mt-1" style={{ color: 'var(--text-muted, #777)' }}>{t('vgpSchedules.pageSubtitle')}</p>
      </div>

      {isReadOnly && <VGPReadOnlyBanner />}

      {/* 4 Cards - White with colored borders */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<AlertCircle className="w-5 h-5" />}
          title={t('vgpSchedules.overdue')}
          value={summary.overdue}
          active={statusFilter === 'overdue'}
          onClick={() => handleFilterChange('overdue')}
          color={BRAND_COLORS.danger}
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          title={t('vgpSchedules.upcoming')}
          value={summary.upcoming}
          active={statusFilter === 'upcoming'}
          onClick={() => handleFilterChange('upcoming')}
          color={BRAND_COLORS.warningYellow}
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          title={t('vgpSchedules.soon')}
          value={summary.soon}
          active={statusFilter === 'soon'}
          onClick={() => handleFilterChange('soon')}
          color={BRAND_COLORS.warning}
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5" />}
          title={t('vgpSchedules.compliant')}
          value={summary.compliant}
          active={statusFilter === 'compliant'}
          onClick={() => handleFilterChange('compliant')}
          color={BRAND_COLORS.success}
        />
      </div>

      {/* Search Bar */}
      <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-hint, #888)' }} />
          <input
            type="text"
            placeholder={t('vgpSchedules.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-lg text-[14px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
            style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex items-center justify-between">
        <span className="text-[15px] text-gray-600">
          {filteredSchedules.length} {filteredSchedules.length !== 1 ? t('vgpSchedules.resultsPlural') : t('vgpSchedules.results')}
        </span>
        {statusFilter !== 'all' && (
          <button
            onClick={() => handleFilterChange('all')}
            className="text-[15px] text-blue-600 hover:underline"
          >
            {t('vgpSchedules.showAll')}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--card-bg, #edeff2)', padding: '16px 20px' }}>
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#e8600a] mx-auto" />
            <p className="mt-4 text-gray-600">{t('vgpSchedules.loading')}</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-700 font-semibold">{error}</p>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">{t('vgpSchedules.noResults')}</p>
            {(statusFilter !== 'all' || debouncedSearch) && (
              <button
                onClick={() => {
                  setSearch('');
                  handleFilterChange('all');
                }}
                className="mt-4 text-blue-600 hover:underline"
              >
                {t('vgpSchedules.reset')}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <TableHeader>{t('vgpSchedules.equipment')}</TableHeader>
                  <TableHeader>{t('vgpSchedules.category')}</TableHeader>
                  <TableHeader>{t('vgpSchedules.location')}</TableHeader>
                  <TableHeader>{t('vgpSchedules.nextInspection')}</TableHeader>
                  <TableHeader>{t('vgpSchedules.status')}</TableHeader>
                  <TableHeader>{t('vgpSchedules.actions')}</TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: '#dcdee3' }}>
                {filteredSchedules.map((schedule) => {
                  const days = daysUntilDue(schedule.next_due_date);
                  const status = deriveStatus(schedule.next_due_date);

                  return (
                    <tr key={schedule.id} className="hover:bg-black/[0.02] transition-colors">
                      <td className="px-3 py-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-[15px]">{schedule.assets?.name || 'N/A'}</p>
                          <p className="text-[13px] text-gray-500">{t('vgpSchedules.serialNumber')}: {schedule.assets?.serial_number || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[15px] text-gray-700">
                        {schedule.assets?.asset_categories?.name || t('vgpSchedules.uncategorized')}
                      </td>
                      <td className="px-3 py-2 text-[15px] text-gray-700">
                        {schedule.assets?.current_location || t('vgpSchedules.notSpecified')}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gray-900 text-[15px]">{formatDateFR(schedule.next_due_date)}</p>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={status} t={t} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {!isReadOnly && (
                            <button
                              onClick={() => window.location.href = `/vgp/inspection/${schedule.id}`}
                              className="inline-flex items-center justify-center min-h-[44px] px-3 py-2.5 text-[14px] font-medium text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
                              style={{ backgroundColor: 'var(--sidebar-bg, #0a2730)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                              title={t('vgpSchedules.inspection')}
                              aria-label={t('vgpSchedules.inspection')}
                            >
                              {t('vgpSchedules.inspection')}
                            </button>
                          )}
                          {!isReadOnly && (
                            <button
                              onClick={() => handleEdit(schedule)}
                              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 text-[#00252b] hover:bg-[#00252b]/10 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
                              title={t('vgpSchedules.edit')}
                              aria-label={t('vgpSchedules.edit')}
                            >
                              <Edit className="w-5 h-5" aria-hidden="true" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedSchedule(schedule);
                              setShowDetails(true);
                            }}
                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
                            title={t('vgpSchedules.details')}
                            aria-label={t('vgpSchedules.details')}
                          >
                            <Eye className="w-5 h-5" aria-hidden="true" />
                          </button>
                          {!isReadOnly && (
                            <button
                              onClick={() => handleArchive(schedule.id)}
                              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 text-[#f26f00] hover:bg-[#f26f00]/10 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
                              title={t('vgpSchedules.archive')}
                              aria-label={t('vgpSchedules.archive')}
                            >
                              <Archive className="w-5 h-5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {editingSchedule && (
        <EditScheduleModal
          schedule={editingSchedule}
          isOpen={showEdit}
          onClose={() => {
            setShowEdit(false);
            setEditingSchedule(null);
          }}
          onSuccess={handleEditSuccess}
        />
      )}

      {showDetails && selectedSchedule && (
        <DetailsModal
          schedule={selectedSchedule}
          onClose={() => {
            setShowDetails(false);
            setSelectedSchedule(null);
          }}
          t={t}
        />
      )}
    </div>
  );
}

export default function VGPSchedulesManager() {
  //  Hook called HERE, outside FeatureGate
  const { language } = useLanguage();
  const t = createTranslator(language);
  
  return (
    <FeatureGate feature="vgp_compliance">
      <VGPSchedulesContent language={language} t={t} />
    </FeatureGate>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[13px] font-semibold text-[var(--text-hint,#888)] uppercase tracking-wider">
      {children}
    </th>
  );
}

function StatCard({
  icon,
  title,
  value,
  active,
  onClick,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg p-[14px_16px] text-left transition-all cursor-pointer border-l-[3px] ${
        active ? 'ring-2 ring-offset-1' : ''
      }`}
      style={{
        backgroundColor: 'var(--card-bg, #edeff2)',
        borderLeftColor: color,
        ...(active ? { '--tw-ring-color': color } as any : {})
      }}
    >
      <p className="text-[30px] font-semibold" style={{ color }}>{value}</p>
      <p className="text-[13px] font-semibold mt-1" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{title}</p>
    </button>
  );
}

function DetailsModal({ schedule, onClose, t }: { schedule: Schedule; onClose: () => void; t: (key: string) => string }) {
  const status = deriveStatus(schedule.next_due_date);
  const days = daysUntilDue(schedule.next_due_date);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="rounded-xl max-w-[720px] w-full max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
        <div className="sticky top-0 px-6 py-4 flex items-center justify-between" style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderBottom: '0.5px solid #dcdee3' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('vgpSchedules.detailsModal.title')}</h2>
          <button
            onClick={onClose}
            className="transition-colors" style={{ color: 'var(--text-muted, #777)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary, #1a1a1a)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <StatusBadge status={status} t={t} />
            <span className={`text-[15px] font-semibold ${
              days < 0 ? 'text-red-600' : days <= 30 ? 'text-orange-600' : 'text-gray-500'
            }`}>
              {days < 0 ? t('vgpSchedules.detailsModal.overdueBy').replace('{days}', Math.abs(days).toString()) : t('vgpSchedules.detailsModal.daysUntil').replace('{days}', days.toString())}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <InfoField label={t('vgpSchedules.equipment')} value={schedule.assets?.name} />
            <InfoField label={t('vgpSchedules.serialNumber')} value={schedule.assets?.serial_number} />
            <InfoField label={t('vgpSchedules.category')} value={schedule.assets?.asset_categories?.name || t('vgpSchedules.uncategorized')} />
            <InfoField label={t('vgpSchedules.location')} value={schedule.assets?.current_location || t('vgpSchedules.notSpecified')} />
          </div>

          <div className="pt-4 border-t border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">{t('vgpSchedules.detailsModal.inspectionSchedule')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label={t('vgpSchedules.detailsModal.interval')} value={`${schedule.interval_months} ${t('vgpSchedules.detailsModal.months')}`} />
              <InfoField label={t('vgpSchedules.detailsModal.nextInspection')} value={formatDateFR(schedule.next_due_date)} />
              {schedule.last_inspection_date && (
                <InfoField label={t('vgpSchedules.detailsModal.lastInspection')} value={formatDateFR(schedule.last_inspection_date)} />
              )}
              {schedule.inspector_name && (
                <InfoField label={t('vgpSchedules.detailsModal.assignedInspector')} value={schedule.inspector_name} />
              )}
            </div>
          </div>

          {schedule.notes && (
            <div className="pt-4 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">{t('vgpSchedules.detailsModal.notes')}</h3>
              <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{schedule.notes}</p>
            </div>
          )}

          <div className="pt-4 border-t border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-2">{t('vgpSchedules.detailsModal.qrCode')}</h3>
            <p className="font-mono text-[15px] bg-gray-100 p-3 rounded-lg">{schedule.assets?.qr_code}</p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-[14px] font-medium transition-colors"
          >
            {t('vgpSchedules.detailsModal.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-[15px] text-gray-600 mb-1">{label}</p>
      <p className="font-semibold text-gray-900">{value || 'N/A'}</p>
    </div>
  );
}