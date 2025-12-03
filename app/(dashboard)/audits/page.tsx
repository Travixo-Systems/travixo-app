// ============================================================================
// FILE: app/(dashboard)/audits/page.tsx
// PURPOSE: Audits list page - create, view, manage inventory audits
// COPY TO: your-project/app/(dashboard)/audits/page.tsx
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardCheck,
  Plus,
  Search,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
  Package,
  MoreHorizontal,
  Play,
  Eye,
  FileText,
  X,
  ChevronDown,
} from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// ============================================================================
// B2B PROFESSIONAL BRAND COLORS (Matching VGP Module)
// ============================================================================

const BRAND_COLORS = {
  primary: '#1e3a5f',
  danger: '#b91c1c',
  warning: '#d97706',
  warningYellow: '#eab308',
  success: '#047857',
  gray: '#6b7280',
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface Audit {
  id: string;
  name: string;
  status: 'planned' | 'in_progress' | 'completed';
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_assets: number;
  verified_assets: number;
  missing_assets: number;
  created_by: string | null;
  created_at: string;
  users?: {
    full_name: string | null;
    email: string;
  } | null;
}

interface AuditStats {
  total: number;
  planned: number;
  inProgress: number;
  completed: number;
}

interface NewAuditForm {
  name: string;
  scheduled_date: string;
  scope: 'all' | 'location' | 'category';
  selectedLocation: string;
  selectedCategory: string;
}

// ============================================================================
// TRANSLATIONS
// ============================================================================

type Language = 'en' | 'fr';

const translations = {
  pageTitle: {
    en: 'Inventory Audits',
    fr: 'Audits d\'Inventaire',
  },
  pageSubtitle: {
    en: 'Manage and track your equipment audits',
    fr: 'Gérez et suivez vos audits d\'équipement',
  },
  createAudit: {
    en: 'Create Audit',
    fr: 'Créer un Audit',
  },
  searchPlaceholder: {
    en: 'Search audits...',
    fr: 'Rechercher des audits...',
  },
  // Stats cards
  totalAudits: {
    en: 'Total Audits',
    fr: 'Total Audits',
  },
  allTime: {
    en: 'All time',
    fr: 'Historique complet',
  },
  planned: {
    en: 'Planned',
    fr: 'Planifiés',
  },
  scheduledAudits: {
    en: 'Scheduled audits',
    fr: 'Audits planifiés',
  },
  inProgress: {
    en: 'In Progress',
    fr: 'En Cours',
  },
  activeAudits: {
    en: 'Active audits',
    fr: 'Audits actifs',
  },
  completed: {
    en: 'Completed',
    fr: 'Terminés',
  },
  finishedAudits: {
    en: 'Finished audits',
    fr: 'Audits terminés',
  },
  // Table
  auditName: {
    en: 'Audit Name',
    fr: 'Nom de l\'Audit',
  },
  status: {
    en: 'Status',
    fr: 'Statut',
  },
  progress: {
    en: 'Progress',
    fr: 'Progression',
  },
  scheduledDate: {
    en: 'Scheduled Date',
    fr: 'Date Prévue',
  },
  createdBy: {
    en: 'Created By',
    fr: 'Créé Par',
  },
  actions: {
    en: 'Actions',
    fr: 'Actions',
  },
  noAudits: {
    en: 'No audits found',
    fr: 'Aucun audit trouvé',
  },
  noAuditsDesc: {
    en: 'Create your first audit to start tracking inventory',
    fr: 'Créez votre premier audit pour commencer le suivi',
  },
  // Status labels
  statusPlanned: {
    en: 'Planned',
    fr: 'Planifié',
  },
  statusInProgress: {
    en: 'In Progress',
    fr: 'En Cours',
  },
  statusCompleted: {
    en: 'Completed',
    fr: 'Terminé',
  },
  // Actions
  start: {
    en: 'Start',
    fr: 'Démarrer',
  },
  continue: {
    en: 'Continue',
    fr: 'Continuer',
  },
  viewReport: {
    en: 'View Report',
    fr: 'Voir Rapport',
  },
  viewDetails: {
    en: 'View Details',
    fr: 'Voir Détails',
  },
  // Modal
  newAudit: {
    en: 'New Audit',
    fr: 'Nouvel Audit',
  },
  auditNameLabel: {
    en: 'Audit Name',
    fr: 'Nom de l\'Audit',
  },
  auditNamePlaceholder: {
    en: 'e.g., Q4 2025 Inventory Check',
    fr: 'ex: Inventaire T4 2025',
  },
  scheduledDateLabel: {
    en: 'Scheduled Date',
    fr: 'Date Prévue',
  },
  auditScope: {
    en: 'Audit Scope',
    fr: 'Périmètre de l\'Audit',
  },
  allAssets: {
    en: 'All Assets',
    fr: 'Tous les Équipements',
  },
  byLocation: {
    en: 'By Location',
    fr: 'Par Emplacement',
  },
  byCategory: {
    en: 'By Category',
    fr: 'Par Catégorie',
  },
  selectLocation: {
    en: 'Select Location',
    fr: 'Sélectionner Emplacement',
  },
  selectCategory: {
    en: 'Select Category',
    fr: 'Sélectionner Catégorie',
  },
  cancel: {
    en: 'Cancel',
    fr: 'Annuler',
  },
  create: {
    en: 'Create',
    fr: 'Créer',
  },
  creating: {
    en: 'Creating...',
    fr: 'Création...',
  },
  assetsFound: {
    en: 'assets found',
    fr: 'équipements trouvés',
  },
  assetsMissing: {
    en: 'missing',
    fr: 'manquants',
  },
  loading: {
    en: 'Loading...',
    fr: 'Chargement...',
  },
};

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
// STATUS UTILITIES
// ============================================================================

function getStatusConfig(status: Audit['status'], t: typeof translations, lang: Language) {
  switch (status) {
    case 'planned':
      return {
        label: t.statusPlanned[lang],
        color: BRAND_COLORS.primary,
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700',
        Icon: Calendar,
      };
    case 'in_progress':
      return {
        label: t.statusInProgress[lang],
        color: BRAND_COLORS.warning,
        bgColor: 'bg-amber-50',
        textColor: 'text-amber-700',
        Icon: Clock,
      };
    case 'completed':
      return {
        label: t.statusCompleted[lang],
        color: BRAND_COLORS.success,
        bgColor: 'bg-green-50',
        textColor: 'text-green-700',
        Icon: CheckCircle,
      };
    default:
      return {
        label: status,
        color: BRAND_COLORS.gray,
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700',
        Icon: Clock,
      };
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AuditsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  
  // State
  const [mounted, setMounted] = useState(false);
  const [language, setLanguage] = useState<Language>('fr');
  const [audits, setAudits] = useState<Audit[]>([]);
  const [stats, setStats] = useState<AuditStats>({ total: 0, planned: 0, inProgress: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'planned' | 'in_progress' | 'completed'>('all');
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

  const t = translations;

  // ============================================================================
  // HYDRATION FIX - Must mount before accessing localStorage
  // ============================================================================

  useEffect(() => {
    setMounted(true);
    // Set default date only on client side
    setFormData(prev => ({
      ...prev,
      scheduled_date: new Date().toISOString().split('T')[0],
    }));
    // Get language from localStorage only on client
    const savedLang = localStorage.getItem('travixo-language') as Language;
    if (savedLang) setLanguage(savedLang);

    // Listen for language changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'travixo-language' && e.newValue) {
        setLanguage(e.newValue as Language);
      }
    };

    // Also listen for custom event (for same-tab updates)
    const handleLanguageChange = (e: CustomEvent) => {
      setLanguage(e.detail as Language);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('travixo-language-change', handleLanguageChange as EventListener);

    // Poll localStorage for same-tab changes (fallback for toggles that don't dispatch events)
    const pollInterval = setInterval(() => {
      const currentLang = localStorage.getItem('travixo-language') as Language;
      setLanguage(prev => currentLang && currentLang !== prev ? currentLang : prev);
    }, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('travixo-language-change', handleLanguageChange as EventListener);
      clearInterval(pollInterval);
    };
  }, []);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    if (mounted) {
      fetchAudits();
      fetchLocationsAndCategories();
    }
  }, [mounted]);

  useEffect(() => {
    if (mounted) {
      fetchAssetPreviewCount();
    }
  }, [mounted, formData.scope, formData.selectedLocation, formData.selectedCategory]);

  async function fetchAudits() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
      if (!user) {
        console.log('[DEBUG] No user found');
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!userData?.organization_id) {
        console.log('[DEBUG] No organization_id found for user');
        return;
      }

      console.log('[DEBUG] Organization ID:', userData.organization_id);

      // Fetch unique locations from assets
      const { data: assetsData, error: assetsError } = await supabase
        .from('assets')
        .select('current_location')
        .eq('organization_id', userData.organization_id)
        .not('current_location', 'is', null)
        .neq('current_location', '');

      console.log('[DEBUG] Assets data:', assetsData);
      console.log('[DEBUG] Assets error:', assetsError);

      const uniqueLocations = [...new Set((assetsData || []).map(a => a.current_location).filter(Boolean))] as string[];
      console.log('[DEBUG] Unique locations:', uniqueLocations);
      setLocations(uniqueLocations);

      // Fetch categories - try organization specific first, then all if empty
      let { data: categoriesData, error: catError } = await supabase
        .from('asset_categories')
        .select('id, name')
        .eq('organization_id', userData.organization_id);

      console.log('[DEBUG] Categories (org-specific):', categoriesData);
      console.log('[DEBUG] Categories error:', catError);

      // If no org-specific categories, try getting all (table is UNRESTRICTED)
      if (!categoriesData || categoriesData.length === 0) {
        const { data: allCategories } = await supabase
          .from('asset_categories')
          .select('id, name');
        console.log('[DEBUG] All categories (fallback):', allCategories);
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
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', userData.organization_id);

      if (formData.scope === 'location' && formData.selectedLocation) {
        query = query.eq('current_location', formData.selectedLocation);
      } else if (formData.scope === 'category' && formData.selectedCategory) {
        query = query.eq('category_id', formData.selectedCategory);
      }

      const { count } = await query;
      setAssetPreviewCount(count || 0);
    } catch (err) {
      console.error('Error fetching asset count:', err);
    }
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  async function handleCreateAudit() {
    if (!formData.name.trim()) return;

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!userData?.organization_id) return;

      // Get assets based on scope
      let assetsQuery = supabase
        .from('assets')
        .select('id')
        .eq('organization_id', userData.organization_id);

      if (formData.scope === 'location' && formData.selectedLocation) {
        assetsQuery = assetsQuery.eq('current_location', formData.selectedLocation);
      } else if (formData.scope === 'category' && formData.selectedCategory) {
        assetsQuery = assetsQuery.eq('category_id', formData.selectedCategory);
      }

      const { data: assetsData } = await assetsQuery;
      const assetIds = (assetsData || []).map(a => a.id);

      // Create audit
      const { data: audit, error: auditError } = await supabase
        .from('audits')
        .insert({
          organization_id: userData.organization_id,
          name: formData.name.trim(),
          status: 'planned',
          scheduled_date: formData.scheduled_date,
          total_assets: assetIds.length,
          verified_assets: 0,
          missing_assets: 0,
          created_by: user.id,
        })
        .select()
        .single();

      if (auditError) throw auditError;

      // Create audit items for each asset
      if (audit && assetIds.length > 0) {
        const auditItems = assetIds.map(assetId => ({
          audit_id: audit.id,
          asset_id: assetId,
          status: 'pending',
        }));

        const { error: itemsError } = await supabase
          .from('audit_items')
          .insert(auditItems);

        if (itemsError) throw itemsError;
      }

      // Reset form and close modal
      setFormData({
        name: '',
        scheduled_date: new Date().toISOString().split('T')[0],
        scope: 'all',
        selectedLocation: '',
        selectedCategory: '',
      });
      setShowCreateModal(false);
      fetchAudits();
    } catch (err) {
      console.error('Error creating audit:', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleStartAudit(auditId: string) {
    try {
      const { error } = await supabase
        .from('audits')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', auditId);

      if (error) throw error;
      router.push(`/audits/${auditId}`);
    } catch (err) {
      console.error('Error starting audit:', err);
    }
  }

  // ============================================================================
  // FILTERED DATA
  // ============================================================================

  const filteredAudits = audits.filter(audit => {
    const matchesSearch = audit.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || audit.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!mounted || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        <span className="ml-3 text-gray-600">{t.loading[language]}</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.pageTitle[language]}</h1>
          <p className="text-sm text-gray-500 mt-1">{t.pageSubtitle[language]}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: BRAND_COLORS.primary }}
        >
          <Plus className="w-4 h-4" />
          {t.createAudit[language]}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total */}
        <div className="bg-white rounded-lg p-5 shadow-sm border-l-4 border-b-4 border-gray-400">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t.totalAudits[language]}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
              <p className="text-xs text-gray-400 mt-1">{t.allTime[language]}</p>
            </div>
            <div className="p-3 rounded-full bg-gray-100">
              <ClipboardCheck className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </div>

        {/* Planned */}
        <div 
          className="bg-white rounded-lg p-5 shadow-sm border-l-4 border-b-4 cursor-pointer hover:shadow-md transition-shadow"
          style={{ borderColor: BRAND_COLORS.primary }}
          onClick={() => setStatusFilter(statusFilter === 'planned' ? 'all' : 'planned')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t.planned[language]}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.planned}</p>
              <p className="text-xs text-gray-400 mt-1">{t.scheduledAudits[language]}</p>
            </div>
            <div className="p-3 rounded-full" style={{ backgroundColor: `${BRAND_COLORS.primary}15` }}>
              <Calendar className="w-6 h-6" style={{ color: BRAND_COLORS.primary }} />
            </div>
          </div>
        </div>

        {/* In Progress */}
        <div 
          className="bg-white rounded-lg p-5 shadow-sm border-l-4 border-b-4 cursor-pointer hover:shadow-md transition-shadow"
          style={{ borderColor: BRAND_COLORS.warning }}
          onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t.inProgress[language]}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.inProgress}</p>
              <p className="text-xs text-gray-400 mt-1">{t.activeAudits[language]}</p>
            </div>
            <div className="p-3 rounded-full" style={{ backgroundColor: `${BRAND_COLORS.warning}15` }}>
              <Clock className="w-6 h-6" style={{ color: BRAND_COLORS.warning }} />
            </div>
          </div>
        </div>

        {/* Completed */}
        <div 
          className="bg-white rounded-lg p-5 shadow-sm border-l-4 border-b-4 cursor-pointer hover:shadow-md transition-shadow"
          style={{ borderColor: BRAND_COLORS.success }}
          onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t.completed[language]}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.completed}</p>
              <p className="text-xs text-gray-400 mt-1">{t.finishedAudits[language]}</p>
            </div>
            <div className="p-3 rounded-full" style={{ backgroundColor: `${BRAND_COLORS.success}15` }}>
              <CheckCircle className="w-6 h-6" style={{ color: BRAND_COLORS.success }} />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t.searchPlaceholder[language]}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'planned', 'in_progress', 'completed'] as const).map((status) => {
              const isActive = statusFilter === status;
              const config = status === 'all' 
                ? { label: status === 'all' ? (language === 'fr' ? 'Tous' : 'All') : status, color: BRAND_COLORS.gray }
                : getStatusConfig(status, t, language);
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                  }`}
                  style={isActive ? { backgroundColor: 'color' in config ? config.color : BRAND_COLORS.gray } : undefined}
                >
                  {status === 'all' ? (language === 'fr' ? 'Tous' : 'All') : config.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Audits Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {filteredAudits.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">{t.noAudits[language]}</h3>
            <p className="text-sm text-gray-500 mb-4">{t.noAuditsDesc[language]}</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
              style={{ backgroundColor: BRAND_COLORS.primary }}
            >
              <Plus className="w-4 h-4" />
              {t.createAudit[language]}
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  {t.auditName[language]}
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  {t.status[language]}
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  {t.progress[language]}
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  {t.scheduledDate[language]}
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  {t.createdBy[language]}
                </th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  {t.actions[language]}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAudits.map((audit) => {
                const statusConfig = getStatusConfig(audit.status, t, language);
                const progressPercent = audit.total_assets > 0 
                  ? Math.round((audit.verified_assets / audit.total_assets) * 100) 
                  : 0;

                return (
                  <tr key={audit.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${statusConfig.color}10` }}
                        >
                          <ClipboardCheck className="w-5 h-5" style={{ color: statusConfig.color }} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{audit.name}</p>
                          <p className="text-sm text-gray-500">
                            {audit.total_assets} {language === 'fr' ? 'equipements' : 'assets'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                        <statusConfig.Icon className="w-3.5 h-3.5" />
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-32">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600">{progressPercent}%</span>
                          {audit.missing_assets > 0 && (
                            <span className="text-red-600 text-xs">
                              {audit.missing_assets} {t.assetsMissing[language]}
                            </span>
                          )}
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all"
                            style={{ 
                              width: `${progressPercent}%`,
                              backgroundColor: audit.status === 'completed' ? BRAND_COLORS.success : BRAND_COLORS.primary,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDateFR(audit.scheduled_date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {audit.users?.full_name || audit.users?.email || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {audit.status === 'planned' && (
                          <button
                            onClick={() => handleStartAudit(audit.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors"
                            style={{ backgroundColor: BRAND_COLORS.primary }}
                          >
                            <Play className="w-3.5 h-3.5" />
                            {t.start[language]}
                          </button>
                        )}
                        {audit.status === 'in_progress' && (
                          <button
                            onClick={() => router.push(`/audits/${audit.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors"
                            style={{ backgroundColor: BRAND_COLORS.warning }}
                          >
                            <Play className="w-3.5 h-3.5" />
                            {t.continue[language]}
                          </button>
                        )}
                        {audit.status === 'completed' && (
                          <button
                            onClick={() => router.push(`/audits/${audit.id}/report`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors"
                            style={{ backgroundColor: BRAND_COLORS.success }}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            {t.viewReport[language]}
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/audits/${audit.id}`)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Audit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">{t.newAudit[language]}</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Audit Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t.auditNameLabel[language]}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t.auditNamePlaceholder[language]}
                  className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Scheduled Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t.scheduledDateLabel[language]}
                </label>
                <input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                  className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Audit Scope */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t.auditScope[language]}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['all', 'location', 'category'] as const).map((scope) => (
                    <button
                      key={scope}
                      onClick={() => setFormData({ ...formData, scope, selectedLocation: '', selectedCategory: '' })}
                      className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        formData.scope === scope
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {scope === 'all' ? t.allAssets[language] : scope === 'location' ? t.byLocation[language] : t.byCategory[language]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location Selector */}
              {formData.scope === 'location' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t.selectLocation[language]}
                  </label>
                  <select
                    value={formData.selectedLocation}
                    onChange={(e) => setFormData({ ...formData, selectedLocation: e.target.value })}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">{t.selectLocation[language]}</option>
                    {locations.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Category Selector */}
              {formData.scope === 'category' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t.selectCategory[language]}
                  </label>
                  <select
                    value={formData.selectedCategory}
                    onChange={(e) => setFormData({ ...formData, selectedCategory: e.target.value })}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">{t.selectCategory[language]}</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Asset Preview Count */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg">
                    <Package className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{assetPreviewCount}</p>
                    <p className="text-sm text-gray-500">{t.assetsFound[language]}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t.cancel[language]}
              </button>
              <button
                onClick={handleCreateAudit}
                disabled={!formData.name.trim() || creating}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: BRAND_COLORS.primary }}
              >
                {creating ? t.creating[language] : t.create[language]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}