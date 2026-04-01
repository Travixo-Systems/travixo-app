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
import { ErrorStatePage } from '@/components/ui/ErrorStateAlert';
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
  primary: '#00252b',
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
  const [fetchError, setFetchError] = useState<string | null>(null);
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
    setFetchError(null);
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
    } catch (err: any) {
      console.error('Error fetching audits:', err);
      setFetchError(err?.message || 'Impossible de charger les audits. Vérifiez votre connexion.');
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--text-primary, #1a1a1a)' }} />
        <span className="ml-3" style={{ color: 'var(--text-secondary, #444)' }}>{t('common.loading')}</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-6">
        <ErrorStatePage message={fetchError} onRetry={fetchAudits} />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6 p-3 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[18px] lg:text-[22px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('audits.pageTitle')}</h1>
          <p className="mt-1" style={{ color: 'var(--text-muted, #777)' }}>{t('audits.pageSubtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-white rounded-lg transition-colors text-[15px] font-medium"
          style={{ backgroundColor: BRAND_COLORS.primary }}
        >
          <Plus className="w-4 h-4" />
          {t('audits.createAudit')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Total */}
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded-lg p-5 text-left transition-colors ${
            statusFilter === 'all' ? 'ring-2 ring-gray-400' : ''
          }`}
          style={{
            backgroundColor: 'var(--card-bg, #edeff2)',
            borderLeft: `3px solid ${BRAND_COLORS.gray}`,
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold" style={{ color: 'var(--text-secondary, #444)' }}>{t('audits.totalAudits')}</p>
            <ClipboardCheck className="w-5 h-5" style={{ color: 'var(--text-hint, #888)' }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{stats.total}</p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>{t('audits.allTime')}</p>
        </button>

        {/* Planned */}
        <button
          onClick={() => setStatusFilter('planned')}
          className={`rounded-lg p-5 text-left transition-colors ${
            statusFilter === 'planned' ? 'ring-2 ring-blue-400' : ''
          }`}
          style={{
            backgroundColor: 'var(--card-bg, #edeff2)',
            borderLeft: `3px solid ${BRAND_COLORS.primary}`,
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold" style={{ color: 'var(--text-secondary, #444)' }}>{t('audits.planned')}</p>
            <Calendar className="w-5 h-5" style={{ color: BRAND_COLORS.primary }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.primary }}>{stats.planned}</p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>{t('audits.scheduledAudits')}</p>
        </button>

        {/* In Progress */}
        <button
          onClick={() => setStatusFilter('in_progress')}
          className={`rounded-lg p-5 text-left transition-colors ${
            statusFilter === 'in_progress' ? 'ring-2 ring-orange-400' : ''
          }`}
          style={{
            backgroundColor: 'var(--card-bg, #edeff2)',
            borderLeft: `3px solid ${BRAND_COLORS.warning}`,
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold" style={{ color: 'var(--text-secondary, #444)' }}>{t('audits.inProgress')}</p>
            <Clock className="w-5 h-5" style={{ color: BRAND_COLORS.warning }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.warning }}>{stats.inProgress}</p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>{t('audits.activeAudits')}</p>
        </button>

        {/* Completed */}
        <button
          onClick={() => setStatusFilter('completed')}
          className={`rounded-lg p-5 text-left transition-colors ${
            statusFilter === 'completed' ? 'ring-2 ring-green-400' : ''
          }`}
          style={{
            backgroundColor: 'var(--card-bg, #edeff2)',
            borderLeft: `3px solid ${BRAND_COLORS.success}`,
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold" style={{ color: 'var(--text-secondary, #444)' }}>{t('audits.completed')}</p>
            <CheckCircle className="w-5 h-5" style={{ color: BRAND_COLORS.success }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.success }}>{stats.completed}</p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>{t('audits.finishedAudits')}</p>
        </button>
      </div>

      {/* Search */}
      <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-hint, #888)' }} />
          <input
            type="text"
            placeholder={t('audits.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:ring-2 focus:ring-[#e8600a] focus:border-transparent text-[15px]"
            style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
          />
        </div>
      </div>

      {/* Audits List */}
      {filteredAudits.length === 0 ? (
        <div className="rounded-lg p-12 text-center" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
          <ClipboardCheck className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-hint, #888)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('audits.noAudits')}</h3>
          <p className="mt-1" style={{ color: 'var(--text-muted, #777)' }}>{t('audits.noAuditsDesc')}</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 text-white rounded-lg text-[15px] font-medium"
            style={{ backgroundColor: BRAND_COLORS.primary }}
          >
            {t('audits.createAudit')}
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
            <table className="w-full">
              <thead style={{ backgroundColor: 'var(--input-bg, #e3e5e9)' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted, #777)' }}>
                    {t('audits.auditName')}
                  </th>
                  <th className="px-6 py-3 text-left text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted, #777)' }}>
                    {t('audits.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted, #777)' }}>
                    {t('audits.progress')}
                  </th>
                  <th className="px-6 py-3 text-left text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted, #777)' }}>
                    {t('audits.scheduledDate')}
                  </th>
                  <th className="px-6 py-3 text-left text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted, #777)' }}>
                    {t('audits.createdBy')}
                  </th>
                  <th className="px-6 py-3 text-right text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted, #777)' }}>
                    {t('audits.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: '#dcdee3' }}>
                {filteredAudits.map((audit) => {
                  const config = STATUS_CONFIG[audit.status];
                  const StatusIcon = config.icon;
                  const progress = audit.total_assets > 0
                    ? Math.round(((audit.verified_assets + audit.missing_assets) / audit.total_assets) * 100)
                    : 0;

                  return (
                    <tr key={audit.id} className="hover:bg-black/[0.02]">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: `${config.color}15` }}
                          >
                            <ClipboardCheck className="w-5 h-5" style={{ color: config.color }} />
                          </div>
                          <span className="font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{audit.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] font-medium rounded-full ${config.bgColor}`}
                          style={{ color: config.color }}
                        >
                          <StatusIcon className="w-3.5 h-3.5" />
                          {t(config.labelKey)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-24 rounded-full h-2" style={{ backgroundColor: '#dcdee3' }}>
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{
                                width: `${progress}%`,
                                backgroundColor: audit.status === 'completed' ? BRAND_COLORS.success : BRAND_COLORS.primary,
                              }}
                            />
                          </div>
                          <span className="text-[15px]" style={{ color: 'var(--text-secondary, #444)' }}>{progress}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[15px]" style={{ color: 'var(--text-secondary, #444)' }}>
                        {formatDateFR(audit.scheduled_date)}
                      </td>
                      <td className="px-6 py-4 text-[15px]" style={{ color: 'var(--text-secondary, #444)' }}>
                        {audit.users?.full_name || audit.users?.email || '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {audit.status === 'planned' && (
                          <button
                            onClick={() => router.push(`/audits/${audit.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white rounded-lg"
                            style={{ backgroundColor: BRAND_COLORS.primary }}
                          >
                            <Play className="w-3.5 h-3.5" />
                            {t('audits.start')}
                          </button>
                        )}
                        {audit.status === 'in_progress' && (
                          <button
                            onClick={() => router.push(`/audits/${audit.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white rounded-lg"
                            style={{ backgroundColor: BRAND_COLORS.warning }}
                          >
                            <Play className="w-3.5 h-3.5" />
                            {t('audits.continue')}
                          </button>
                        )}
                        {audit.status === 'completed' && (
                          <button
                            onClick={() => router.push(`/audits/${audit.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white rounded-lg"
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

          {/* Mobile/Tablet card grid */}
          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredAudits.map((audit) => {
              const config = STATUS_CONFIG[audit.status];
              const StatusIcon = config.icon;
              const progress = audit.total_assets > 0
                ? Math.round(((audit.verified_assets + audit.missing_assets) / audit.total_assets) * 100)
                : 0;

              return (
                <div
                  key={audit.id}
                  className="rounded-lg p-3 cursor-pointer active:opacity-80 transition-opacity"
                  style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}
                  onClick={() => router.push(`/audits/${audit.id}`)}
                >
                  {/* Line 1: Audit name + Status badge */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {audit.name}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[12px] font-medium rounded-full flex-shrink-0 ${config.bgColor}`}
                      style={{ color: config.color }}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {t(config.labelKey)}
                    </span>
                  </div>

                  {/* Line 2: Date + Scope info */}
                  <p className="text-[12px] mt-1" style={{ color: 'var(--text-secondary, #444)' }}>
                    {formatDateFR(audit.scheduled_date)}
                    {' \u00b7 '}
                    {audit.verified_assets + audit.missing_assets}/{audit.total_assets} {language === 'fr' ? 'actifs' : 'assets'}
                  </p>

                  {/* Line 3: Progress bar */}
                  {audit.total_assets > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 rounded-full h-2" style={{ backgroundColor: '#dcdee3' }}>
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${progress}%`,
                            backgroundColor: audit.status === 'completed' ? BRAND_COLORS.success : BRAND_COLORS.primary,
                          }}
                        />
                      </div>
                      <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary, #444)' }}>{progress}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="rounded-xl max-w-lg w-full mx-4 p-6"
            style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[22px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('audits.newAudit')}</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-black/[0.05] rounded-lg transition-colors"
              >
                <X className="w-5 h-5" style={{ color: 'var(--text-muted, #777)' }} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[15px] font-semibold mb-1" style={{ color: 'var(--text-secondary, #444)' }}>
                  {t('audits.auditNameLabel')}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('audits.auditNamePlaceholder')}
                  className="w-full px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-[#e8600a] focus:border-transparent"
                  style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-[15px] font-semibold mb-1" style={{ color: 'var(--text-secondary, #444)' }}>
                  {t('audits.scheduledDateLabel')}
                </label>
                <input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-[#e8600a] focus:border-transparent"
                  style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                />
              </div>

              {/* Scope */}
              <div>
                <label className="block text-[15px] font-semibold mb-2" style={{ color: 'var(--text-secondary, #444)' }}>
                  {t('audits.auditScope')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setFormData({ ...formData, scope: 'all', selectedLocation: '', selectedCategory: '' })}
                    className={`px-3 py-2 text-[15px] font-medium rounded-lg border transition-colors ${
                      formData.scope === 'all'
                        ? 'border-[#e8600a] bg-[#e8600a]/10 text-[#e8600a]'
                        : 'border-[#dcdee3] hover:bg-black/[0.02]'
                    }`}
                  >
                    {t('audits.allAssets')}
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, scope: 'location', selectedCategory: '' })}
                    className={`px-3 py-2 text-[15px] font-medium rounded-lg border transition-colors ${
                      formData.scope === 'location'
                        ? 'border-[#e8600a] bg-[#e8600a]/10 text-[#e8600a]'
                        : 'border-[#dcdee3] hover:bg-black/[0.02]'
                    }`}
                  >
                    {t('audits.byLocation')}
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, scope: 'category', selectedLocation: '' })}
                    className={`px-3 py-2 text-[15px] font-medium rounded-lg border transition-colors ${
                      formData.scope === 'category'
                        ? 'border-[#e8600a] bg-[#e8600a]/10 text-[#e8600a]'
                        : 'border-[#dcdee3] hover:bg-black/[0.02]'
                    }`}
                  >
                    {t('audits.byCategory')}
                  </button>
                </div>
              </div>

              {/* Location selector */}
              {formData.scope === 'location' && (
                <div>
                  <label className="block text-[15px] font-semibold mb-1" style={{ color: 'var(--text-secondary, #444)' }}>
                    {t('audits.selectLocation')}
                  </label>
                  <div className="relative">
                    <select
                      value={formData.selectedLocation}
                      onChange={(e) => setFormData({ ...formData, selectedLocation: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-[#e8600a] focus:border-transparent appearance-none"
                      style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                    >
                      <option value="">{t('audits.selectLocation')}</option>
                      {locations.map((loc) => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-hint, #888)' }} />
                  </div>
                </div>
              )}

              {/* Category selector */}
              {formData.scope === 'category' && (
                <div>
                  <label className="block text-[15px] font-semibold mb-1" style={{ color: 'var(--text-secondary, #444)' }}>
                    {t('audits.selectCategory')}
                  </label>
                  <div className="relative">
                    <select
                      value={formData.selectedCategory}
                      onChange={(e) => setFormData({ ...formData, selectedCategory: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg focus:ring-2 focus:ring-[#e8600a] focus:border-transparent appearance-none"
                      style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                    >
                      <option value="">{t('audits.selectCategory')}</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-hint, #888)' }} />
                  </div>
                </div>
              )}

              {/* Asset preview with exclusion support */}
              <div>
                <div className="flex items-center justify-between p-3 rounded-t-lg" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', borderColor: '#dcdee3' }}>
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5" style={{ color: 'var(--text-muted, #777)' }} />
                    <span className="text-lg font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{activeAssetCount}</span>
                    <span className="text-[15px]" style={{ color: 'var(--text-secondary, #444)' }}>{t('audits.assetsFound')}</span>
                  </div>
                  {excludedAssets.length > 0 && (
                    <span className="text-[13px] text-amber-700 bg-amber-50 px-2 py-1 rounded-full flex items-center gap-1">
                      <Ban className="w-3 h-3" />
                      {excludedAssets.length} excluded
                    </span>
                  )}
                </div>

                {scopeAssets.length > 0 && (
                  <div className="border border-t-0 rounded-b-lg max-h-48 overflow-y-auto" style={{ borderColor: '#dcdee3' }}>
                    {scopeAssets.map((asset) => {
                      const isExcluded = excludedAssets.some(e => e.asset_id === asset.id);
                      const isExcluding = excludingAssetId === asset.id;

                      return (
                        <div
                          key={asset.id}
                          className={`px-3 py-2 border-b last:border-b-0 ${
                            isExcluded ? 'bg-red-50' : 'hover:bg-black/[0.02]'
                          }`}
                          style={{ borderColor: '#dcdee3' }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <span className={`text-[15px] font-medium ${isExcluded ? 'text-red-700 line-through' : ''}`} style={isExcluded ? undefined : { color: 'var(--text-primary, #1a1a1a)' }}>
                                {asset.name}
                              </span>
                              {asset.serial_number && (
                                <span className="text-[13px] ml-2" style={{ color: 'var(--text-muted, #777)' }}>#{asset.serial_number}</span>
                              )}
                            </div>
                            {isExcluded ? (
                              <button
                                onClick={() => handleRemoveExclusion(asset.id)}
                                className="text-[13px] text-red-600 hover:text-red-800 font-medium ml-2 whitespace-nowrap"
                              >
                                Restore
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setExcludingAssetId(isExcluding ? null : asset.id);
                                  setExclusionReason('');
                                }}
                                className="text-[13px] hover:text-amber-700 font-medium ml-2 whitespace-nowrap" style={{ color: 'var(--text-muted, #777)' }}
                              >
                                {isExcluding ? 'Cancel' : 'Exclude'}
                              </button>
                            )}
                          </div>

                          {isExcluded && (
                            <p className="text-[13px] text-red-600 mt-0.5 flex items-center gap-1">
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
                                className="flex-1 px-2 py-1 text-[13px] rounded focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                                style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                                maxLength={200}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleExcludeAsset(asset.id);
                                }}
                              />
                              <button
                                onClick={() => handleExcludeAsset(asset.id)}
                                disabled={!exclusionReason.trim()}
                                className="px-2 py-1 text-[13px] bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
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
                    <p className="text-[13px] text-amber-800 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Excluded assets will be documented in the audit report with their exclusion reasons (DREETS compliant).
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6 pt-4 border-t" style={{ borderColor: '#dcdee3' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg font-medium hover:bg-black/[0.05] transition-colors"
                style={{ color: 'var(--text-secondary, #444)', backgroundColor: 'var(--input-bg, #e3e5e9)' }}
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