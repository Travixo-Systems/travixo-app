'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Calendar, Search, Archive, Eye, Edit, AlertCircle, CheckCircle, Clock, X,
} from 'lucide-react';
import { EditScheduleModal } from './EditScheduleModal';

// ============================================================================
// B2B PROFESSIONAL BRAND COLORS (Org-Modular)
// ============================================================================

const BRAND_COLORS = {
  primary: '#1e3a5f',     // Deep slate blue
  danger: '#b91c1c',      // Red
  warning: '#d97706',     // Safety orange
  warningYellow: '#eab308', // Yellow
  success: '#047857',     // Forest green
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

function StatusBadge({ status }: { status: StatusFilter }) {
  const config: Record<StatusFilter, { label: string; bg: string; text: string }> = {
    all: { label: 'Tous', bg: 'bg-slate-100', text: 'text-slate-800' },
    overdue: { label: 'En retard', bg: 'bg-red-100', text: 'text-red-800' },
    upcoming: { label: 'À venir', bg: 'bg-yellow-100', text: 'text-yellow-800' },
    soon: { label: 'Bientôt', bg: 'bg-orange-100', text: 'text-orange-800' },
    compliant: { label: 'Conforme', bg: 'bg-green-100', text: 'text-green-800' },
  };

  const { label, bg, text } = config[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bg} ${text}`}>
      {label}
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
      <p className={`font-medium text-sm ${type === 'success' ? 'text-green-900' : 'text-red-900'}`}>{message}</p>
      <button onClick={onClose} className="ml-2 text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function VGPSchedulesManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
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
        setError(e?.message || 'Erreur de chargement');
        setSchedules([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
    const reason = prompt("Raison de l'archivage (requis) :");
    if (!reason?.trim()) return;

    try {
      const res = await fetch(`/api/vgp/schedules/${scheduleId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'Échec de l\'archivage');
      }

      setSchedules(prev => prev.filter(s => s.id !== scheduleId));
      setToast({ message: 'Calendrier archivé avec succès', type: 'success' });
    } catch (e: any) {
      console.error('Archive error:', e);
      setToast({ message: e?.message || 'Erreur lors de l\'archivage', type: 'error' });
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
    setToast({ message: 'Calendrier mis à jour avec succès', type: 'success' });
    
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
        <h1 className="text-3xl font-bold text-gray-900">Suivi VGP</h1>
        <p className="text-gray-600 mt-1">Planification et suivi des inspections périodiques</p>
      </div>

      {/* 4 Cards - White with colored borders */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<AlertCircle className="w-5 h-5" />}
          title="En retard"
          value={summary.overdue}
          active={statusFilter === 'overdue'}
          onClick={() => handleFilterChange('overdue')}
          color={BRAND_COLORS.danger}
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          title="À venir"
          value={summary.upcoming}
          active={statusFilter === 'upcoming'}
          onClick={() => handleFilterChange('upcoming')}
          color={BRAND_COLORS.warningYellow}
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          title="Bientôt"
          value={summary.soon}
          active={statusFilter === 'soon'}
          onClick={() => handleFilterChange('soon')}
          color={BRAND_COLORS.warning}
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5" />}
          title="Conforme"
          value={summary.compliant}
          active={statusFilter === 'compliant'}
          onClick={() => handleFilterChange('compliant')}
          color={BRAND_COLORS.success}
        />
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, numéro de série, emplacement..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
        <span className="text-sm text-gray-600">
          {filteredSchedules.length} résultat{filteredSchedules.length !== 1 ? 's' : ''}
        </span>
        {statusFilter !== 'all' && (
          <button
            onClick={() => handleFilterChange('all')}
            className="text-sm text-blue-600 hover:underline"
          >
            Tout afficher
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-4 text-gray-600">Chargement...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-700 font-semibold">{error}</p>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">Aucun résultat</p>
            {(statusFilter !== 'all' || debouncedSearch) && (
              <button
                onClick={() => {
                  setSearch('');
                  handleFilterChange('all');
                }}
                className="mt-4 text-blue-600 hover:underline"
              >
                Réinitialiser
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <TableHeader>Équipement</TableHeader>
                  <TableHeader>Catégorie</TableHeader>
                  <TableHeader>Emplacement</TableHeader>
                  <TableHeader>Prochaine</TableHeader>
                  <TableHeader>Statut</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSchedules.map((schedule) => {
                  const days = daysUntilDue(schedule.next_due_date);
                  const status = deriveStatus(schedule.next_due_date);

                  return (
                    <tr key={schedule.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{schedule.assets?.name || 'N/A'}</p>
                          <p className="text-xs text-gray-500">S/N: {schedule.assets?.serial_number || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700">
                        {schedule.assets?.asset_categories?.name || 'Non catégorisé'}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700">
                        {schedule.assets?.current_location || 'Non spécifié'}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gray-900 text-sm">{formatDateFR(schedule.next_due_date)}</p>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          
                            <button
                              onClick={() => window.location.href = `/vgp/inspection/${schedule.id}`}
                              className="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-red-700 rounded transition-colors"
                              title="Enregistrer inspection"
                            >
                              Inspection
                            </button>
                        
                          <button
                            onClick={() => handleEdit(schedule)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Modifier"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedSchedule(schedule);
                              setShowDetails(true);
                            }}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleArchive(schedule.id)}
                            className="p-1.5 text-orange-600 hover:bg-orange-50 rounded transition-colors"
                            title="Archiver"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
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
        />
      )}
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
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
  if (CARD_STYLE === 'bordered') {
    return (
      <button
        onClick={onClick}
        className={`bg-white rounded-lg p-4 text-left hover:shadow-md transition-all hover:scale-[1.02] cursor-pointer border-l-4 ${
          active ? 'shadow-lg ring-2 ring-offset-1' : 'shadow-sm border-r border-t border-b border-gray-200'
        }`}
        style={{ 
          borderLeftColor: color,
          ...(active ? { '--tw-ring-color': color } as any : {})
        }}
      >
        <div className="flex items-start justify-between mb-2">
          <div style={{ color }}>{icon}</div>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <p className="text-sm font-medium text-gray-700">{title}</p>
      </button>
    );
  }

  // Filled style (for org modularity)
  return (
    <button
      onClick={onClick}
      className={`rounded-lg p-4 text-left hover:shadow-md transition-all hover:scale-[1.02] cursor-pointer border-2 ${
        active ? 'ring-2 ring-offset-2' : ''
      }`}
      style={active ? { borderColor: color, '--tw-ring-color': color } as any : {}}
    >
      <div className="flex items-start justify-between mb-2">
        <div style={{ color }}>{icon}</div>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      </div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
    </button>
  );
}

function DetailsModal({ schedule, onClose }: { schedule: Schedule; onClose: () => void }) {
  const status = deriveStatus(schedule.next_due_date);
  const days = daysUntilDue(schedule.next_due_date);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Détails du calendrier VGP</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            <span className={`text-sm font-medium ${
              days < 0 ? 'text-red-600' : days <= 30 ? 'text-orange-600' : 'text-gray-500'
            }`}>
              {days < 0 ? `${Math.abs(days)} jours de retard` : `dans ${days} jours`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <InfoField label="Équipement" value={schedule.assets?.name} />
            <InfoField label="Numéro de série" value={schedule.assets?.serial_number} />
            <InfoField label="Catégorie" value={schedule.assets?.asset_categories?.name || 'Non catégorisé'} />
            <InfoField label="Emplacement" value={schedule.assets?.current_location || 'Non spécifié'} />
          </div>

          <div className="pt-4 border-t border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Calendrier d'inspection</h3>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="Intervalle" value={`${schedule.interval_months} mois`} />
              <InfoField label="Prochaine inspection" value={formatDateFR(schedule.next_due_date)} />
              {schedule.last_inspection_date && (
                <InfoField label="Dernière inspection" value={formatDateFR(schedule.last_inspection_date)} />
              )}
              {schedule.inspector_name && (
                <InfoField label="Inspecteur attitré" value={schedule.inspector_name} />
              )}
            </div>
          </div>

          {schedule.notes && (
            <div className="pt-4 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
              <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{schedule.notes}</p>
            </div>
          )}

          <div className="pt-4 border-t border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-2">Code QR</h3>
            <p className="font-mono text-sm bg-gray-100 p-3 rounded-lg">{schedule.assets?.qr_code}</p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-sm text-gray-600 mb-1">{label}</p>
      <p className="font-semibold text-gray-900">{value || 'N/A'}</p>
    </div>
  );
}