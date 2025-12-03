// ============================================================================
// FILE: app/(dashboard)/team/page.tsx
// PURPOSE: Team management - invite members, change roles, remove members
// COPY TO: your-project/app/(dashboard)/team/page.tsx
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Mail,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  MoreHorizontal,
  X,
  Trash2,
  Edit,
  Clock,
  CheckCircle,
  AlertCircle,
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

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: string;
  updated_at: string;
  last_login?: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  invited_by: string | null;
  expires_at: string;
  created_at: string;
  status: 'pending' | 'accepted' | 'expired';
  inviter?: {
    full_name: string | null;
    email: string;
  } | null;
}

interface TeamStats {
  total: number;
  admins: number;
  members: number;
  viewers: number;
  pendingInvites: number;
}

type RoleType = 'owner' | 'admin' | 'member' | 'viewer';

// ============================================================================
// TRANSLATIONS
// ============================================================================

type Language = 'en' | 'fr';

const translations = {
  pageTitle: {
    en: 'Team Management',
    fr: 'Gestion de l\'Equipe',
  },
  pageSubtitle: {
    en: 'Manage team members and permissions',
    fr: 'Gerez les membres de l\'equipe et les permissions',
  },
  inviteMember: {
    en: 'Invite Member',
    fr: 'Inviter un Membre',
  },
  searchPlaceholder: {
    en: 'Search members...',
    fr: 'Rechercher des membres...',
  },
  // Stats
  totalMembers: {
    en: 'Total Members',
    fr: 'Total Membres',
  },
  activeUsers: {
    en: 'Active users',
    fr: 'Utilisateurs actifs',
  },
  administrators: {
    en: 'Administrators',
    fr: 'Administrateurs',
  },
  fullAccess: {
    en: 'Full access',
    fr: 'Acces complet',
  },
  teamMembers: {
    en: 'Team Members',
    fr: 'Membres d\'Equipe',
  },
  standardAccess: {
    en: 'Standard access',
    fr: 'Acces standard',
  },
  pendingInvites: {
    en: 'Pending Invites',
    fr: 'Invitations en Attente',
  },
  awaitingResponse: {
    en: 'Awaiting response',
    fr: 'En attente de reponse',
  },
  // Table headers
  member: {
    en: 'Member',
    fr: 'Membre',
  },
  role: {
    en: 'Role',
    fr: 'Role',
  },
  status: {
    en: 'Status',
    fr: 'Statut',
  },
  joinedDate: {
    en: 'Joined',
    fr: 'Membre Depuis',
  },
  lastActive: {
    en: 'Last Active',
    fr: 'Derniere Activite',
  },
  actions: {
    en: 'Actions',
    fr: 'Actions',
  },
  // Roles
  roleOwner: {
    en: 'Owner',
    fr: 'Proprietaire',
  },
  roleAdmin: {
    en: 'Administrator',
    fr: 'Administrateur',
  },
  roleMember: {
    en: 'Member',
    fr: 'Membre',
  },
  roleViewer: {
    en: 'Viewer',
    fr: 'Lecteur',
  },
  // Role descriptions
  roleOwnerDesc: {
    en: 'Full control including billing and settings',
    fr: 'Controle total incluant facturation et parametres',
  },
  roleAdminDesc: {
    en: 'Manage assets, VGP, audits, and team',
    fr: 'Gerer equipements, VGP, audits et equipe',
  },
  roleMemberDesc: {
    en: 'View and edit assets, record inspections',
    fr: 'Consulter et modifier equipements, enregistrer inspections',
  },
  roleViewerDesc: {
    en: 'Read-only access to dashboard and reports',
    fr: 'Acces en lecture seule au tableau de bord et rapports',
  },
  // Status labels
  statusActive: {
    en: 'Active',
    fr: 'Actif',
  },
  statusPending: {
    en: 'Pending',
    fr: 'En Attente',
  },
  statusExpired: {
    en: 'Expired',
    fr: 'Expire',
  },
  // Actions
  changeRole: {
    en: 'Change Role',
    fr: 'Changer le Role',
  },
  resendInvite: {
    en: 'Resend Invite',
    fr: 'Renvoyer l\'Invitation',
  },
  cancelInvite: {
    en: 'Cancel Invite',
    fr: 'Annuler l\'Invitation',
  },
  removeMember: {
    en: 'Remove Member',
    fr: 'Retirer le Membre',
  },
  // Empty states
  noMembers: {
    en: 'No team members yet',
    fr: 'Aucun membre d\'equipe',
  },
  noMembersDesc: {
    en: 'Invite team members to collaborate',
    fr: 'Invitez des membres pour collaborer',
  },
  noPending: {
    en: 'No pending invitations',
    fr: 'Aucune invitation en attente',
  },
  // Modal
  inviteNewMember: {
    en: 'Invite New Member',
    fr: 'Inviter un Nouveau Membre',
  },
  emailAddress: {
    en: 'Email Address',
    fr: 'Adresse Email',
  },
  emailPlaceholder: {
    en: 'colleague@company.com',
    fr: 'collegue@entreprise.com',
  },
  selectRole: {
    en: 'Select Role',
    fr: 'Selectionner un Role',
  },
  cancel: {
    en: 'Cancel',
    fr: 'Annuler',
  },
  sendInvite: {
    en: 'Send Invitation',
    fr: 'Envoyer l\'Invitation',
  },
  sending: {
    en: 'Sending...',
    fr: 'Envoi...',
  },
  inviteSent: {
    en: 'Invitation sent successfully',
    fr: 'Invitation envoyee avec succes',
  },
  // Confirm dialogs
  confirmRemove: {
    en: 'Are you sure you want to remove this member?',
    fr: 'Etes-vous sur de vouloir retirer ce membre ?',
  },
  confirmRemoveDesc: {
    en: 'They will lose access to the organization immediately.',
    fr: 'Il perdra immediatement l\'acces a l\'organisation.',
  },
  confirm: {
    en: 'Confirm',
    fr: 'Confirmer',
  },
  loading: {
    en: 'Loading...',
    fr: 'Chargement...',
  },
  you: {
    en: '(You)',
    fr: '(Vous)',
  },
  expiresIn: {
    en: 'Expires in',
    fr: 'Expire dans',
  },
  days: {
    en: 'days',
    fr: 'jours',
  },
  // Sections
  activeMembers: {
    en: 'Active Members',
    fr: 'Membres Actifs',
  },
  pendingInvitations: {
    en: 'Pending Invitations',
    fr: 'Invitations en Attente',
  },
};

// ============================================================================
// UTILITIES
// ============================================================================

function formatDateFR(iso: string | null): string {
  if (!iso) return '-';
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string | null, lang: Language): string {
  if (!iso) return '-';
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return lang === 'fr' ? 'Aujourd\'hui' : 'Today';
    if (diffDays === 1) return lang === 'fr' ? 'Hier' : 'Yesterday';
    if (diffDays < 7) return lang === 'fr' ? `Il y a ${diffDays} jours` : `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return lang === 'fr' ? `Il y a ${weeks} semaine${weeks > 1 ? 's' : ''}` : `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    return formatDateFR(iso);
  } catch {
    return iso || '-';
  }
}

function getRoleConfig(role: RoleType, t: typeof translations, lang: Language) {
  switch (role) {
    case 'owner':
      return {
        label: t.roleOwner[lang],
        description: t.roleOwnerDesc[lang],
        color: BRAND_COLORS.primary,
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700',
        Icon: ShieldCheck,
      };
    case 'admin':
      return {
        label: t.roleAdmin[lang],
        description: t.roleAdminDesc[lang],
        color: BRAND_COLORS.success,
        bgColor: 'bg-green-50',
        textColor: 'text-green-700',
        Icon: Shield,
      };
    case 'member':
      return {
        label: t.roleMember[lang],
        description: t.roleMemberDesc[lang],
        color: BRAND_COLORS.warning,
        bgColor: 'bg-amber-50',
        textColor: 'text-amber-700',
        Icon: Users,
      };
    case 'viewer':
      return {
        label: t.roleViewer[lang],
        description: t.roleViewerDesc[lang],
        color: BRAND_COLORS.gray,
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700',
        Icon: Eye,
      };
    default:
      return {
        label: role,
        description: '',
        color: BRAND_COLORS.gray,
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700',
        Icon: Users,
      };
  }
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.split(' ');
    return parts.map(p => p[0]).slice(0, 2).join('').toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TeamPage() {
  const supabase = createClientComponentClient();
  
  // State
  const [mounted, setMounted] = useState(false);
  const [language, setLanguage] = useState<Language>('fr');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [stats, setStats] = useState<TeamStats>({ total: 0, admins: 0, members: 0, viewers: 0, pendingInvites: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType>('member');
  
  // Modal states
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  
  // Form states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [sending, setSending] = useState(false);

  const t = translations;

  // ============================================================================
  // HYDRATION FIX - Must mount before accessing localStorage
  // ============================================================================

  useEffect(() => {
    setMounted(true);
    // Get language from localStorage only on client
    const savedLang = localStorage.getItem('travixo-language') as Language;
    if (savedLang) setLanguage(savedLang);
  }, []);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    if (mounted) {
      fetchTeamData();
    }
  }, [mounted]);

  async function fetchTeamData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id, role')
        .eq('id', user.id)
        .single();

      if (!userData?.organization_id) return;
      setCurrentUserRole(userData.role as RoleType);

      // Fetch team members
      const { data: membersData, error: membersError } = await supabase
        .from('users')
        .select('*')
        .eq('organization_id', userData.organization_id)
        .order('role', { ascending: true })
        .order('created_at', { ascending: true });

      if (membersError) throw membersError;

      const teamMembers = (membersData || []) as TeamMember[];
      setMembers(teamMembers);

      // Calculate stats
      setStats({
        total: teamMembers.length,
        admins: teamMembers.filter(m => m.role === 'admin' || m.role === 'owner').length,
        members: teamMembers.filter(m => m.role === 'member').length,
        viewers: teamMembers.filter(m => m.role === 'viewer').length,
        pendingInvites: 0, // Will update from invitations
      });

      // Note: team_invitations table may not exist yet
      // This is prepared for when it's created
      try {
        const { data: invitesData } = await supabase
          .from('team_invitations')
          .select(`
            *,
            inviter:invited_by (
              full_name,
              email
            )
          `)
          .eq('organization_id', userData.organization_id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (invitesData) {
          setInvitations(invitesData as Invitation[]);
          setStats(prev => ({ ...prev, pendingInvites: invitesData.length }));
        }
      } catch {
        // Table doesn't exist yet, that's okay
        setInvitations([]);
      }
    } catch (err) {
      console.error('Error fetching team data:', err);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  async function handleInvite() {
    if (!inviteEmail.trim()) return;

    setSending(true);
    try {
      // For now, show a message that the feature needs backend setup
      // In production, this would call the invite API
      alert(language === 'fr' 
        ? 'Fonctionnalite en cours de developpement. L\'API d\'invitation sera bientot disponible.'
        : 'Feature in development. Invitation API coming soon.');
      
      setInviteEmail('');
      setInviteRole('member');
      setShowInviteModal(false);
    } catch (err) {
      console.error('Error sending invite:', err);
    } finally {
      setSending(false);
    }
  }

  async function handleChangeRole(memberId: string, newRole: RoleType) {
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', memberId);

      if (error) throw error;
      
      setShowRoleModal(false);
      setSelectedMember(null);
      fetchTeamData();
    } catch (err) {
      console.error('Error changing role:', err);
    }
  }

  async function handleRemoveMember() {
    if (!selectedMember) return;

    try {
      // Remove the user from the organization
      const { error } = await supabase
        .from('users')
        .update({ organization_id: null, updated_at: new Date().toISOString() })
        .eq('id', selectedMember.id);

      if (error) throw error;
      
      setShowRemoveModal(false);
      setSelectedMember(null);
      fetchTeamData();
    } catch (err) {
      console.error('Error removing member:', err);
    }
  }

  // ============================================================================
  // FILTERED DATA
  // ============================================================================

  const filteredMembers = members.filter(member =>
    (member.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    member.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canManageTeam = currentUserRole === 'owner' || currentUserRole === 'admin';

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
        {canManageTeam && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
            style={{ backgroundColor: BRAND_COLORS.primary }}
          >
            <UserPlus className="w-4 h-4" />
            {t.inviteMember[language]}
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total Members */}
        <div className="bg-white rounded-lg p-5 shadow-sm border-l-4 border-b-4 border-gray-400">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t.totalMembers[language]}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
              <p className="text-xs text-gray-400 mt-1">{t.activeUsers[language]}</p>
            </div>
            <div className="p-3 rounded-full bg-gray-100">
              <Users className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </div>

        {/* Administrators */}
        <div 
          className="bg-white rounded-lg p-5 shadow-sm border-l-4 border-b-4"
          style={{ borderColor: BRAND_COLORS.success }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t.administrators[language]}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.admins}</p>
              <p className="text-xs text-gray-400 mt-1">{t.fullAccess[language]}</p>
            </div>
            <div className="p-3 rounded-full" style={{ backgroundColor: `${BRAND_COLORS.success}15` }}>
              <ShieldCheck className="w-6 h-6" style={{ color: BRAND_COLORS.success }} />
            </div>
          </div>
        </div>

        {/* Team Members */}
        <div 
          className="bg-white rounded-lg p-5 shadow-sm border-l-4 border-b-4"
          style={{ borderColor: BRAND_COLORS.warning }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t.teamMembers[language]}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.members + stats.viewers}</p>
              <p className="text-xs text-gray-400 mt-1">{t.standardAccess[language]}</p>
            </div>
            <div className="p-3 rounded-full" style={{ backgroundColor: `${BRAND_COLORS.warning}15` }}>
              <Users className="w-6 h-6" style={{ color: BRAND_COLORS.warning }} />
            </div>
          </div>
        </div>

        {/* Pending Invites */}
        <div 
          className="bg-white rounded-lg p-5 shadow-sm border-l-4 border-b-4"
          style={{ borderColor: BRAND_COLORS.primary }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t.pendingInvites[language]}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.pendingInvites}</p>
              <p className="text-xs text-gray-400 mt-1">{t.awaitingResponse[language]}</p>
            </div>
            <div className="p-3 rounded-full" style={{ backgroundColor: `${BRAND_COLORS.primary}15` }}>
              <Clock className="w-6 h-6" style={{ color: BRAND_COLORS.primary }} />
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t.searchPlaceholder[language]}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Active Members Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.activeMembers[language]}</h2>
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {filteredMembers.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">{t.noMembers[language]}</h3>
              <p className="text-sm text-gray-500 mb-4">{t.noMembersDesc[language]}</p>
              {canManageTeam && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
                  style={{ backgroundColor: BRAND_COLORS.primary }}
                >
                  <UserPlus className="w-4 h-4" />
                  {t.inviteMember[language]}
                </button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    {t.member[language]}
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    {t.role[language]}
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    {t.joinedDate[language]}
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    {t.lastActive[language]}
                  </th>
                  {canManageTeam && (
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                      {t.actions[language]}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredMembers.map((member) => {
                  const roleConfig = getRoleConfig(member.role, t, language);
                  const isCurrentUser = member.id === currentUserId;
                  const canEdit = canManageTeam && !isCurrentUser && member.role !== 'owner';

                  return (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm"
                            style={{ backgroundColor: roleConfig.color }}
                          >
                            {getInitials(member.full_name, member.email)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">
                                {member.full_name || member.email.split('@')[0]}
                              </p>
                              {isCurrentUser && (
                                <span className="text-xs text-gray-500">{t.you[language]}</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${roleConfig.bgColor} ${roleConfig.textColor}`}>
                            <roleConfig.Icon className="w-3.5 h-3.5" />
                            {roleConfig.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDateFR(member.created_at)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatRelativeTime(member.updated_at, language)}
                      </td>
                      {canManageTeam && (
                        <td className="px-6 py-4">
                          {canEdit && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setSelectedMember(member);
                                  setShowRoleModal(true);
                                }}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                title={t.changeRole[language]}
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedMember(member);
                                  setShowRemoveModal(true);
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title={t.removeMember[language]}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pending Invitations Section */}
      {invitations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.pendingInvitations[language]}</h2>
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    {t.emailAddress[language]}
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    {t.role[language]}
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                    {t.status[language]}
                  </th>
                  {canManageTeam && (
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                      {t.actions[language]}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invitations.map((invite) => {
                  const roleConfig = getRoleConfig(invite.role, t, language);

                  return (
                    <tr key={invite.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-gray-100">
                            <Mail className="w-4 h-4 text-gray-500" />
                          </div>
                          <span className="text-gray-900">{invite.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${roleConfig.bgColor} ${roleConfig.textColor}`}>
                          <roleConfig.Icon className="w-3.5 h-3.5" />
                          {roleConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700">
                          <Clock className="w-3.5 h-3.5" />
                          {t.statusPending[language]}
                        </span>
                      </td>
                      {canManageTeam && (
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              {t.resendInvite[language]}
                            </button>
                            <button
                              className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              {t.cancelInvite[language]}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowInviteModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">{t.inviteNewMember[language]}</h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t.emailAddress[language]}
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t.emailPlaceholder[language]}
                  className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t.selectRole[language]}
                </label>
                <div className="space-y-2">
                  {(['admin', 'member', 'viewer'] as const).map((role) => {
                    const config = getRoleConfig(role, t, language);
                    return (
                      <button
                        key={role}
                        onClick={() => setInviteRole(role)}
                        className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          inviteRole === role
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div 
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${config.color}15` }}
                        >
                          <config.Icon className="w-4 h-4" style={{ color: config.color }} />
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-gray-900">{config.label}</p>
                          <p className="text-xs text-gray-500">{config.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t.cancel[language]}
              </button>
              <button
                onClick={handleInvite}
                disabled={!inviteEmail.trim() || sending}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: BRAND_COLORS.primary }}
              >
                {sending ? t.sending[language] : t.sendInvite[language]}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {showRoleModal && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => { setShowRoleModal(false); setSelectedMember(null); }}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">{t.changeRole[language]}</h2>
              <button
                onClick={() => { setShowRoleModal(false); setSelectedMember(null); }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              {selectedMember.full_name || selectedMember.email}
            </p>

            <div className="space-y-2">
              {(['admin', 'member', 'viewer'] as const).map((role) => {
                const config = getRoleConfig(role, t, language);
                const isCurrentRole = selectedMember.role === role;
                return (
                  <button
                    key={role}
                    onClick={() => handleChangeRole(selectedMember.id, role)}
                    disabled={isCurrentRole}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      isCurrentRole
                        ? 'border-blue-500 bg-blue-50 cursor-default'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div 
                      className="p-2 rounded-lg"
                      style={{ backgroundColor: `${config.color}15` }}
                    >
                      <config.Icon className="w-4 h-4" style={{ color: config.color }} />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">
                        {config.label}
                        {isCurrentRole && <span className="text-xs text-gray-500 ml-2">(Current)</span>}
                      </p>
                      <p className="text-xs text-gray-500">{config.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {showRemoveModal && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => { setShowRemoveModal(false); setSelectedMember(null); }}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-full bg-red-100">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{t.removeMember[language]}</h2>
              </div>
            </div>

            <p className="text-gray-600 mb-2">{t.confirmRemove[language]}</p>
            <p className="text-sm text-gray-500 mb-6">{t.confirmRemoveDesc[language]}</p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-white font-medium">
                  {getInitials(selectedMember.full_name, selectedMember.email)}
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {selectedMember.full_name || selectedMember.email.split('@')[0]}
                  </p>
                  <p className="text-sm text-gray-500">{selectedMember.email}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowRemoveModal(false); setSelectedMember(null); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t.cancel[language]}
              </button>
              <button
                onClick={handleRemoveMember}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
                style={{ backgroundColor: BRAND_COLORS.danger }}
              >
                {t.confirm[language]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}