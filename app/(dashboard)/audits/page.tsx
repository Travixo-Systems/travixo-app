// ============================================================================
// FILE: app/(dashboard)/audits/page.tsx
// PURPOSE: Audits list page - create, view, manage inventory audits
// COPY TO: your-project/app/(dashboard)/audits/page.tsx
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/client';
import {
  ClipboardCheck,
  Calendar,
  Clock,
  CheckCircle,
  Search,
  Plus,
  Play,
  Eye,
  Package,
  MapPin,
  Filter,
  X,
  ChevronDown,
  Ban,
  AlertTriangle,
} from 'lucide-react';

// ============================================================================
// BRAND COLORS - Matches VGP module
// ============================================================================

const BRAND_COLORS = {
  primary: '#1e3a5f',
  danger: '#b91c1c',
  warning: '#d97706',
  warningYellow: '#eab308',
  success: '#047857',
  gray: '#6b7280',
};

// ============================================================================
// TYPES
// ============================================================================

type AuditStatus = 'planned' | 'in_progress' | 'completed';

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
  users?: {
    full_name: string | null;
    email: string;
  };
}

interface AuditStats {
  total: number;
  planned: number;
  inProgress: number;
  completed: number;
}

interface ScopeAsset {
  id: string;
  name: string;
  serial_number: string | null;
  current_location: string | null;
}

interface ExcludedAsset {
  asset_id: string;
  reason: string;
}

interface NewAuditForm {
  name: string;
  scheduled_date: string;
  scope: 'all' | 'location' | 'category';
  selectedLocation: string;
  selectedCategory: string;
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

function formatDateFR(iso: string | null): string {
  if (!iso) return '-';
  try {
    const [y, m, d] = iso.split('T')[0].split('-').map(n => parseInt(n, 10));
    const date = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return iso;
  }
}

// ============================================================================
// STATUS CONFIG
// ============================================================================

const STATUS_CONFIG: Record<AuditStatus, { color: string; bgColor: string; icon: React.ElementType; labelKey: string }> = {
  planned: {
    color: BRAND_COLORS.primary,
    bgColor: 'bg-blue-50',
    icon: Calendar,
    labelKey: 'audits.statusPlanned',
  },
  in_progress: {
    color: BRAND_COLORS.warning,
    bgColor: 'bg-orange-50',
    icon: Clock,
    labelKey: 'audits.statusInProgress',
  },
  completed: {
    color: BRAND_COLORS.success,
    bgColor: 'bg-green-50',
    icon: CheckCircle,
    labelKey: 'audits.statusCompleted',
  },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AuditsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = createTranslator(language);
  const supabase = createClient();
  
  // State
  const [audits, setAudits] = useState<Audit[]>([]);
  const [stats, setStats] = useState<AuditStats>({ total: 0, planned: 0, inProgress: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AuditStatus>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [locations, setLocations] = useState<string[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [formData, setFormData] = useState<NewAuditForm>({
    name: '',
    scheduled_date: '',
    scope: 'all',
    selectedLocation: '',
    selectedCategory: '',
  });
  const [assetPreviewCount, setAssetPreviewCount] = useState(0);
  const [scopeAssets, setScopeAssets] = useState<ScopeAsset[]>([]);
  const [excludedAssets, setExcludedAssets] = useState<ExcludedAsset[]>([]);
  const [excludingAssetId, setExcludingAssetId] = useState<string | null>(null);
  const [exclusionReason, setExclusionReason] = useState('');

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    // Set default date on client only
    setFormData(prev => ({
      ...prev,
      scheduled_date: new Date().toISOString().split('T')[0],
    }));
    fetchAudits();
    fetchLocationsAndCategories();
  }, []);

  useEffect(() => {
    fetchAssetPreviewCount();
  }, [formData.scope, formData.selectedLocation, formData.selectedCategory]);

  async function fetchAudits() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!userData?.organization_id) return;

      const { data, error } = await supabase
        .from('audits')
        .select(`
          *,
          users:created_by (
            full_name,
            email
          )
        `)
        .eq('organization_id', userData.organization_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const auditsData = (data || []) as Audit[];
      setAudits(auditsData);

      // Calculate stats
      setStats({
        total: auditsData.length,
        planned: auditsData.filter(a => a.status === 'planned').length,
        inProgress: auditsData.filter(a => a.status === 'in_progress').length,
        completed: auditsData.filter(a => a.status === 'completed').length,
      });
    } catch (err) {
      console.error('Error fetching audits:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLocationsAndCategories() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!userData?.organization_id) return;

      // Fetch unique locations from assets
      const { data: assetsData } = await supabase
        .from('assets')
        .select('current_location')
        .eq('organization_id', userData.organization_id)
        .not('current_location', 'is', null)
        .neq('current_location', '');

      const uniqueLocations = [...new Set((assetsData || []).map(a => a.current_location).filter(Boolean))] as string[];
      setLocations(uniqueLocations);

      // Fetch categories - try org-specific first, then all
      let { data: categoriesData } = await supabase
        .from('asset_categories')
        .select('id, name')
        .eq('organization_id', userData.organization_id);

      if (!categoriesData || categoriesData.length === 0) {
        const { data: allCategories } = await supabase
          .from('asset_categories')
          .select('id, name');
        categoriesData = allCategories;
      }

      setCategories(categoriesData || []);
    } catch (err) {
      console.error('Error fetching locations/categories:', err);
    }
  }

  async function fetchAssetPreviewCount() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!userData?.organization_id) return;

      let query = supabase
        .from('assets')
        .select('id, name, serial_number, current_location')
        .eq('organization_id', userData.organization_id);

      if (formData.scope === 'location' && formData.selectedLocation) {
        query = query.eq('current_location', formData.selectedLocation);
      } else if (formData.scope === 'category' && formData.selectedCategory) {
        query = query.eq('category_id', formData.selectedCategory);
      }

      const { data: assets, count } = await query.order('name').limit(500);
      setScopeAssets((assets || []) as unknown as ScopeAsset[]);
      setAssetPreviewCount(assets?.length || 0);
      // Reset exclusions when scope changes
      setExcludedAssets([]);
      setExcludingAssetId(null);
      setExclusionReason('');
    } catch (err) {
      console.error('Error fetching asset count:', err);
    }
  }

  // ============================================================================
  // CREATE AUDIT
  // ============================================================================

  function handleExcludeAsset(assetId: string) {
    if (!exclusionReason.trim()) return;
    setExcludedAssets(prev => [...prev.filter(e => e.asset_id !== assetId), { asset_id: assetId, reason: exclusionReason.trim() }]);
    setExcludingAssetId(null);
    setExclusionReason('');
  }

  function handleRemoveExclusion(assetId: string) {
    setExcludedAssets(prev => prev.filter(e => e.asset_id !== assetId));
  }

  const activeAssetCount = assetPreviewCount - excludedAssets.length;

  async function handleCreateAudit() {
    if (!formData.name.trim()) return;

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        name: formData.name.trim(),
        scheduled_date: formData.scheduled_date || null,
        scope: formData.scope,
      };

      if (formData.scope === 'location' && formData.selectedLocation) {
        body.location = formData.selectedLocation;
      } else if (formData.scope === 'category' && formData.selectedCategory) {
        body.category_id = formData.selectedCategory;
      }

      if (excludedAssets.length > 0) {
        body.excluded_assets = excludedAssets.map(e => ({
          asset_id: e.asset_id,
          exclusion_reason: e.reason,
        }));
      }

      const response = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create audit');
      }

      // Reset form and close modal
      setFormData({
        name: '',
        scheduled_date: new Date().toISOString().split('T')[0],
        scope: 'all',
        selectedLocation: '',
        selectedCategory: '',
      });
      setExcludedAssets([]);
      setShowCreateModal(false);
      fetchAudits();
    } catch (err) {
      console.error('Error creating audit:', err);
    } finally {
      setCreating(false);
    }
  }

  // ============================================================================
  // FILTER & SEARCH
  // ============================================================================

  const filteredAudits = audits.filter(audit => {
    const matchesSearch = audit.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || audit.status === statusFilter;
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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('audits.pageTitle')}</h1>
          <p className="text-gray-600 mt-1">{t('audits.pageSubtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-white rounded-lg transition-colors text-sm font-medium"
          style={{ backgroundColor: BRAND_COLORS.primary }}
        >
          <Plus className="w-4 h-4" />
          {t('audits.createAudit')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Total */}
        <button
          onClick={() => setStatusFilter('all')}
          className={`bg-white rounded-lg p-5 text-left transition-shadow hover:shadow-md ${
            statusFilter === 'all' ? 'ring-2 ring-gray-400' : ''
          }`}
          style={{
            borderLeft: `4px solid ${BRAND_COLORS.gray}`,
            borderBottom: `4px solid ${BRAND_COLORS.gray}`,
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('audits.totalAudits')}</p>
            <ClipboardCheck className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-1">{t('audits.allTime')}</p>
        </button>

        {/* Planned */}
        <button
          onClick={() => setStatusFilter('planned')}
          className={`bg-white rounded-lg p-5 text-left transition-shadow hover:shadow-md ${
            statusFilter === 'planned' ? 'ring-2 ring-blue-400' : ''
          }`}
          style={{
            borderLeft: `4px solid ${BRAND_COLORS.primary}`,
            borderBottom: `4px solid ${BRAND_COLORS.primary}`,
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('audits.planned')}</p>
            <Calendar className="w-5 h-5" style={{ color: BRAND_COLORS.primary }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.primary }}>{stats.planned}</p>
          <p className="text-xs text-gray-500 mt-1">{t('audits.scheduledAudits')}</p>
        </button>

        {/* In Progress */}
        <button
          onClick={() => setStatusFilter('in_progress')}
          className={`bg-white rounded-lg p-5 text-left transition-shadow hover:shadow-md ${
            statusFilter === 'in_progress' ? 'ring-2 ring-orange-400' : ''
          }`}
          style={{
            borderLeft: `4px solid ${BRAND_COLORS.warning}`,
            borderBottom: `4px solid ${BRAND_COLORS.warning}`,
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('audits.inProgress')}</p>
            <Clock className="w-5 h-5" style={{ color: BRAND_COLORS.warning }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.warning }}>{stats.inProgress}</p>
          <p className="text-xs text-gray-500 mt-1">{t('audits.activeAudits')}</p>
        </button>

        {/* Completed */}
        <button
          onClick={() => setStatusFilter('completed')}
          className={`bg-white rounded-lg p-5 text-left transition-shadow hover:shadow-md ${
            statusFilter === 'completed' ? 'ring-2 ring-green-400' : ''
          }`}
          style={{
            borderLeft: `4px solid ${BRAND_COLORS.success}`,
            borderBottom: `4px solid ${BRAND_COLORS.success}`,
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('audits.completed')}</p>
            <CheckCircle className="w-5 h-5" style={{ color: BRAND_COLORS.success }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.success }}>{stats.completed}</p>
          <p className="text-xs text-gray-500 mt-1">{t('audits.finishedAudits')}</p>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('audits.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Audits List */}
      {filteredAudits.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">{t('audits.noAudits')}</h3>
          <p className="text-gray-500 mt-1">{t('audits.noAuditsDesc')}</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 text-white rounded-lg text-sm font-medium"
            style={{ backgroundColor: BRAND_COLORS.primary }}
          >
            {t('audits.createAudit')}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('audits.auditName')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('audits.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('audits.progress')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('audits.scheduledDate')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('audits.createdBy')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('audits.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAudits.map((audit) => {
                const config = STATUS_CONFIG[audit.status];
                const StatusIcon = config.icon;
                const progress = audit.total_assets > 0
                  ? Math.round(((audit.verified_assets + audit.missing_assets) / audit.total_assets) * 100)
                  : 0;

                return (
                  <tr key={audit.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${config.color}15` }}
                        >
                          <ClipboardCheck className="w-5 h-5" style={{ color: config.color }} />
                        </div>
                        <span className="font-medium text-gray-900">{audit.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${config.bgColor}`}
                        style={{ color: config.color }}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                        {t(config.labelKey)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${progress}%`,
                              backgroundColor: audit.status === 'completed' ? BRAND_COLORS.success : BRAND_COLORS.primary,
                            }}
                          />
                        </div>
                        <span className="text-sm text-gray-600">{progress}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDateFR(audit.scheduled_date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {audit.users?.full_name || audit.users?.email || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {audit.status === 'planned' && (
                        <button
                          onClick={() => router.push(`/audits/${audit.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                          style={{ backgroundColor: BRAND_COLORS.primary }}
                        >
                          <Play className="w-3.5 h-3.5" />
                          {t('audits.start')}
                        </button>
                      )}
                      {audit.status === 'in_progress' && (
                        <button
                          onClick={() => router.push(`/audits/${audit.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                          style={{ backgroundColor: BRAND_COLORS.warning }}
                        >
                          <Play className="w-3.5 h-3.5" />
                          {t('audits.continue')}
                        </button>
                      )}
                      {audit.status === 'completed' && (
                        <button
                          onClick={() => router.push(`/audits/${audit.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                          style={{ backgroundColor: BRAND_COLORS.success }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {t('audits.viewReport')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">{t('audits.newAudit')}</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('audits.auditNameLabel')}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('audits.auditNamePlaceholder')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('audits.scheduledDateLabel')}
                </label>
                <input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Scope */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('audits.auditScope')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setFormData({ ...formData, scope: 'all', selectedLocation: '', selectedCategory: '' })}
                    className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      formData.scope === 'all'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {t('audits.allAssets')}
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, scope: 'location', selectedCategory: '' })}
                    className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      formData.scope === 'location'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {t('audits.byLocation')}
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, scope: 'category', selectedLocation: '' })}
                    className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      formData.scope === 'category'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {t('audits.byCategory')}
                  </button>
                </div>
              </div>

              {/* Location selector */}
              {formData.scope === 'location' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('audits.selectLocation')}
                  </label>
                  <div className="relative">
                    <select
                      value={formData.selectedLocation}
                      onChange={(e) => setFormData({ ...formData, selectedLocation: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                    >
                      <option value="">{t('audits.selectLocation')}</option>
                      {locations.map((loc) => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Category selector */}
              {formData.scope === 'category' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('audits.selectCategory')}
                  </label>
                  <div className="relative">
                    <select
                      value={formData.selectedCategory}
                      onChange={(e) => setFormData({ ...formData, selectedCategory: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                    >
                      <option value="">{t('audits.selectCategory')}</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Asset preview with exclusion support */}
              <div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-t-lg border border-gray-200">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-gray-500" />
                    <span className="text-lg font-semibold text-gray-900">{activeAssetCount}</span>
                    <span className="text-sm text-gray-600">{t('audits.assetsFound')}</span>
                  </div>
                  {excludedAssets.length > 0 && (
                    <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full flex items-center gap-1">
                      <Ban className="w-3 h-3" />
                      {excludedAssets.length} excluded
                    </span>
                  )}
                </div>

                {scopeAssets.length > 0 && (
                  <div className="border border-t-0 border-gray-200 rounded-b-lg max-h-48 overflow-y-auto">
                    {scopeAssets.map((asset) => {
                      const isExcluded = excludedAssets.some(e => e.asset_id === asset.id);
                      const isExcluding = excludingAssetId === asset.id;

                      return (
                        <div
                          key={asset.id}
                          className={`px-3 py-2 border-b border-gray-100 last:border-b-0 ${
                            isExcluded ? 'bg-red-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm font-medium ${isExcluded ? 'text-red-700 line-through' : 'text-gray-900'}`}>
                                {asset.name}
                              </span>
                              {asset.serial_number && (
                                <span className="text-xs text-gray-500 ml-2">#{asset.serial_number}</span>
                              )}
                            </div>
                            {isExcluded ? (
                              <button
                                onClick={() => handleRemoveExclusion(asset.id)}
                                className="text-xs text-red-600 hover:text-red-800 font-medium ml-2 whitespace-nowrap"
                              >
                                Restore
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setExcludingAssetId(isExcluding ? null : asset.id);
                                  setExclusionReason('');
                                }}
                                className="text-xs text-gray-500 hover:text-amber-700 font-medium ml-2 whitespace-nowrap"
                              >
                                {isExcluding ? 'Cancel' : 'Exclude'}
                              </button>
                            )}
                          </div>

                          {isExcluded && (
                            <p className="text-xs text-red-600 mt-0.5 flex items-center gap-1">
                              <Ban className="w-3 h-3" />
                              {excludedAssets.find(e => e.asset_id === asset.id)?.reason}
                            </p>
                          )}

                          {isExcluding && (
                            <div className="mt-2 flex gap-2">
                              <input
                                type="text"
                                placeholder="Reason for exclusion (required)"
                                value={exclusionReason}
                                onChange={(e) => setExclusionReason(e.target.value)}
                                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                                maxLength={200}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleExcludeAsset(asset.id);
                                }}
                              />
                              <button
                                onClick={() => handleExcludeAsset(asset.id)}
                                disabled={!exclusionReason.trim()}
                                className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                              >
                                Confirm
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {excludedAssets.length > 0 && (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-800 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Excluded assets will be documented in the audit report with their exclusion reasons (DIRECCTE compliant).
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCreateAudit}
                disabled={creating || !formData.name.trim()}
                className="flex-1 px-4 py-2.5 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: BRAND_COLORS.primary }}
              >
                {creating ? t('audits.creating') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}