// ============================================================================
// FILE: app/(dashboard)/audits/[id]/page.tsx
// PURPOSE: Audit detail/execution page - verify assets, track progress
// COPY TO: your-project/app/(dashboard)/audits/[id]/page.tsx
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeft,
  ClipboardCheck,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Play,
  Download,
  Package,
  MapPin,
  AlertCircle,
  X,
} from 'lucide-react';

// ============================================================================
// BRAND COLORS
// ============================================================================

const BRAND_COLORS = {
  primary: '#1e3a5f',
  danger: '#b91c1c',
  warning: '#d97706',
  success: '#047857',
  gray: '#6b7280',
};

// ============================================================================
// TYPES
// ============================================================================

type AuditStatus = 'planned' | 'in_progress' | 'completed';
type ItemStatus = 'all' | 'pending' | 'verified' | 'missing';

interface Audit {
  id: string;
  organization_id: string;
  name: string;
  status: AuditStatus;
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_assets: number;
  verified_assets: number;
  missing_assets: number;
  created_by: string;
  created_at: string;
}

interface AuditItem {
  id: string;
  audit_id: string;
  asset_id: string;
  status: 'pending' | 'verified' | 'missing';
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  assets: {
    id: string;
    name: string;
    serial_number: string | null;
    current_location: string | null;
    asset_categories: {
      name: string;
    } | null;
  };
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

function formatDateTimeFR(iso: string | null): string {
  if (!iso) return '-';
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return iso;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AuditDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { language } = useLanguage();
  const t = createTranslator(language);
  const supabase = createClient();
  const auditId = params.id as string;
  
  // State
  const [audit, setAudit] = useState<Audit | null>(null);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ItemStatus>('all');
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    if (auditId) {
      fetchAuditData();
    }
  }, [auditId]);

  async function fetchAuditData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Fetch audit
      const { data: auditData, error: auditError } = await supabase
        .from('audits')
        .select('*')
        .eq('id', auditId)
        .single();

      if (auditError) throw auditError;
      setAudit(auditData);

      // Fetch audit items with asset details
      const { data: itemsData, error: itemsError } = await supabase
        .from('audit_items')
        .select(`
          *,
          assets (
            id,
            name,
            serial_number,
            current_location,
            asset_categories (name)
          )
        `)
        .eq('audit_id', auditId);

      if (itemsError) throw itemsError;
      setItems(itemsData || []);
    } catch (err) {
      console.error('Error fetching audit:', err);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  async function startAudit() {
    if (!audit) return;
    
    try {
      const { error } = await supabase
        .from('audits')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', audit.id);

      if (error) throw error;
      fetchAuditData();
    } catch (err) {
      console.error('Error starting audit:', err);
    }
  }

  async function updateItemStatus(itemId: string, newStatus: 'verified' | 'missing') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('audit_items')
        .update({
          status: newStatus,
          verified_at: new Date().toISOString(),
          verified_by: user.id,
        })
        .eq('id', itemId);

      if (error) throw error;

      // Update local state
      setItems(prev => prev.map(item => 
        item.id === itemId 
          ? { ...item, status: newStatus, verified_at: new Date().toISOString(), verified_by: user.id }
          : item
      ));

      // Update audit counts
      const updatedItems = items.map(item => 
        item.id === itemId ? { ...item, status: newStatus } : item
      );
      const verified = updatedItems.filter(i => i.status === 'verified').length;
      const missing = updatedItems.filter(i => i.status === 'missing').length;

      await supabase
        .from('audits')
        .update({
          verified_assets: verified,
          missing_assets: missing,
        })
        .eq('id', auditId);

      setAudit(prev => prev ? { ...prev, verified_assets: verified, missing_assets: missing } : null);
    } catch (err) {
      console.error('Error updating item:', err);
    }
  }

  async function completeAudit() {
    if (!audit) return;

    try {
      // Mark all pending as missing
      const pendingItems = items.filter(i => i.status === 'pending');
      if (pendingItems.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase
          .from('audit_items')
          .update({
            status: 'missing',
            verified_at: new Date().toISOString(),
            verified_by: user?.id,
          })
          .in('id', pendingItems.map(i => i.id));
      }

      const verified = items.filter(i => i.status === 'verified').length;
      const missing = items.filter(i => i.status !== 'verified').length;

      const { error } = await supabase
        .from('audits')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          verified_assets: verified,
          missing_assets: missing,
        })
        .eq('id', audit.id);

      if (error) throw error;
      setShowCompleteModal(false);
      fetchAuditData();
    } catch (err) {
      console.error('Error completing audit:', err);
    }
  }

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const stats = {
    total: items.length,
    verified: items.filter(i => i.status === 'verified').length,
    pending: items.filter(i => i.status === 'pending').length,
    missing: items.filter(i => i.status === 'missing').length,
  };

  const progress = stats.total > 0 
    ? Math.round(((stats.verified + stats.missing) / stats.total) * 100)
    : 0;

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.assets?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.assets?.serial_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.assets?.current_location?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        <span className="ml-3 text-gray-600">{t('common.loading')}</span>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-lg font-medium text-gray-900">{t('audits.auditNotFound')}</h2>
        <button
          onClick={() => router.push('/audits')}
          className="mt-4 text-blue-600 hover:underline"
        >
          {t('audits.backToAudits')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/audits')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{audit.name}</h1>
            {audit.status === 'completed' && audit.completed_at && (
              <p className="text-sm text-gray-500">
                {t('audits.completedOn')} {formatDateTimeFR(audit.completed_at)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {audit.status === 'planned' && (
            <button
              onClick={startAudit}
              className="flex items-center gap-2 px-4 py-2.5 text-white rounded-lg font-medium"
              style={{ backgroundColor: BRAND_COLORS.primary }}
            >
              <Play className="w-4 h-4" />
              {t('audits.startAudit')}
            </button>
          )}
          {audit.status === 'in_progress' && (
            <button
              onClick={() => setShowCompleteModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-white rounded-lg font-medium"
              style={{ backgroundColor: BRAND_COLORS.success }}
            >
              <CheckCircle className="w-4 h-4" />
              {t('audits.completeAudit')}
            </button>
          )}
          {audit.status === 'completed' && (
            <button
              className="flex items-center gap-2 px-4 py-2.5 text-white rounded-lg font-medium"
              style={{ backgroundColor: BRAND_COLORS.primary }}
            >
              <Download className="w-4 h-4" />
              {t('audits.exportResults')}
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{t('audits.progress')}</span>
          <span className="text-sm font-bold" style={{ color: audit.status === 'completed' ? BRAND_COLORS.success : BRAND_COLORS.primary }}>
            {progress}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="h-3 rounded-full transition-all"
            style={{
              width: `${progress}%`,
              backgroundColor: audit.status === 'completed' ? BRAND_COLORS.success : BRAND_COLORS.primary,
            }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <button
          onClick={() => setStatusFilter('all')}
          className={`bg-white rounded-lg p-4 text-left transition-shadow hover:shadow-md ${
            statusFilter === 'all' ? 'ring-2 ring-gray-400' : ''
          }`}
          style={{ borderLeft: `4px solid ${BRAND_COLORS.gray}` }}
        >
          <p className="text-sm text-gray-600">{t('audits.totalAssets')}</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </button>

        <button
          onClick={() => setStatusFilter('verified')}
          className={`bg-white rounded-lg p-4 text-left transition-shadow hover:shadow-md ${
            statusFilter === 'verified' ? 'ring-2 ring-green-400' : ''
          }`}
          style={{ borderLeft: `4px solid ${BRAND_COLORS.success}` }}
        >
          <p className="text-sm text-gray-600">{t('audits.verified')}</p>
          <p className="text-2xl font-bold" style={{ color: BRAND_COLORS.success }}>{stats.verified}</p>
        </button>

        <button
          onClick={() => setStatusFilter('pending')}
          className={`bg-white rounded-lg p-4 text-left transition-shadow hover:shadow-md ${
            statusFilter === 'pending' ? 'ring-2 ring-orange-400' : ''
          }`}
          style={{ borderLeft: `4px solid ${BRAND_COLORS.warning}` }}
        >
          <p className="text-sm text-gray-600">{t('audits.pending')}</p>
          <p className="text-2xl font-bold" style={{ color: BRAND_COLORS.warning }}>{stats.pending}</p>
        </button>

        <button
          onClick={() => setStatusFilter('missing')}
          className={`bg-white rounded-lg p-4 text-left transition-shadow hover:shadow-md ${
            statusFilter === 'missing' ? 'ring-2 ring-red-400' : ''
          }`}
          style={{ borderLeft: `4px solid ${BRAND_COLORS.danger}` }}
        >
          <p className="text-sm text-gray-600">{t('audits.missing')}</p>
          <p className="text-2xl font-bold" style={{ color: BRAND_COLORS.danger }}>{stats.missing}</p>
        </button>
      </div>

      {/* Not Started State */}
      {audit.status === 'planned' && (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">{t('audits.auditNotStarted')}</h3>
          <p className="text-gray-500 mt-1">{t('audits.auditNotStartedDesc')}</p>
          <button
            onClick={startAudit}
            className="mt-4 px-6 py-2.5 text-white rounded-lg font-medium"
            style={{ backgroundColor: BRAND_COLORS.primary }}
          >
            {t('audits.startAudit')}
          </button>
        </div>
      )}

      {/* Search & Filter */}
      {audit.status !== 'planned' && (
        <>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('audits.searchAssets')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          </div>

          {/* Items List */}
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">{t('audits.noAssetsFound')}</h3>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('audits.asset')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('audits.category')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('audits.serialNumber')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('audits.location')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('audits.status')}
                    </th>
                    {audit.status === 'in_progress' && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('audits.actions')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                            <Package className="w-4 h-4 text-gray-500" />
                          </div>
                          <span className="font-medium text-gray-900">{item.assets?.name || '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {item.assets?.asset_categories?.name || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-gray-600">
                          {item.assets?.serial_number || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <MapPin className="w-3.5 h-3.5" />
                          {item.assets?.current_location || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {item.status === 'pending' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-orange-50" style={{ color: BRAND_COLORS.warning }}>
                            <Clock className="w-3.5 h-3.5" />
                            {t('audits.pending')}
                          </span>
                        )}
                        {item.status === 'verified' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-green-50" style={{ color: BRAND_COLORS.success }}>
                            <CheckCircle className="w-3.5 h-3.5" />
                            {t('audits.verified')}
                          </span>
                        )}
                        {item.status === 'missing' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-red-50" style={{ color: BRAND_COLORS.danger }}>
                            <XCircle className="w-3.5 h-3.5" />
                            {t('audits.missing')}
                          </span>
                        )}
                      </td>
                      {audit.status === 'in_progress' && (
                        <td className="px-6 py-4 text-right">
                          {item.status === 'pending' && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => updateItemStatus(item.id, 'verified')}
                                className="px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                                style={{ backgroundColor: BRAND_COLORS.success }}
                              >
                                {t('audits.markVerified')}
                              </button>
                              <button
                                onClick={() => updateItemStatus(item.id, 'missing')}
                                className="px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                                style={{ backgroundColor: BRAND_COLORS.danger }}
                              >
                                {t('audits.markMissing')}
                              </button>
                            </div>
                          )}
                          {item.status !== 'pending' && (
                            <button
                              onClick={() => updateItemStatus(item.id, item.status === 'verified' ? 'missing' : 'verified')}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {item.status === 'verified' ? t('audits.markMissing') : t('audits.markVerified')}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Complete Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">{t('audits.confirmComplete')}</h2>
              <button
                onClick={() => setShowCompleteModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex items-start gap-3 p-4 bg-yellow-50 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <p className="text-sm text-yellow-800">{t('audits.confirmCompleteDesc')}</p>
            </div>

            <div className="space-y-2 mb-6">
              <h3 className="font-medium text-gray-900">{t('audits.auditSummary')}</h3>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-gray-600">{t('audits.verified')}</span>
                <span className="font-semibold" style={{ color: BRAND_COLORS.success }}>{stats.verified} {t('audits.itemsVerified')}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-gray-600">{t('audits.missing')}</span>
                <span className="font-semibold" style={{ color: BRAND_COLORS.danger }}>{stats.missing} {t('audits.itemsMissing')}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-600">{t('audits.pending')}</span>
                <span className="font-semibold" style={{ color: BRAND_COLORS.warning }}>{stats.pending} {t('audits.itemsPending')}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={completeAudit}
                className="flex-1 px-4 py-2.5 text-white rounded-lg font-medium"
                style={{ backgroundColor: BRAND_COLORS.success }}
              >
                {t('audits.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}