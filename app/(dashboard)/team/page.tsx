// ============================================================================
// FILE: app/(dashboard)/team/page.tsx
// PURPOSE: Team management - invite members, change roles, remove members
// UPDATED: Clickable stat cards for filtering
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/client';
import {
  Users,
  Shield,
  ShieldCheck,
  Eye,
  Search,
  UserPlus,
  Mail,
  MoreHorizontal,
  Edit,
  Trash2,
  AlertCircle,
  X,
  Check,
  RefreshCw,
  Clock,
  Loader2,
} from 'lucide-react';

// ============================================================================
// BRAND COLORS
// ============================================================================

const BRAND_COLORS = {
  primary: '#E30613',
  danger: '#b91c1c',
  warning: '#d97706',
  success: '#047857',
  gray: '#6b7280',
};

// ============================================================================
// TYPES
// ============================================================================

type RoleType = 'owner' | 'admin' | 'member' | 'viewer';
type FilterType = 'all' | 'admins' | 'members' | 'pending';

interface TeamMember {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null; // Legacy, keep for fallback
  role: RoleType;
  organization_id: string;
  created_at: string;
  updated_at: string | null;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  invited_by: string;
}

interface TeamStats {
  total: number;
  admins: number;
  members: number;
  viewers: number;
  pendingInvites: number;
}

// ============================================================================
// ROLE CONFIG
// ============================================================================

const ROLE_CONFIG: Record<RoleType, { icon: React.ElementType; color: string; bgColor: string }> = {
  owner: { icon: ShieldCheck, color: BRAND_COLORS.primary, bgColor: 'bg-blue-50' },
  admin: { icon: Shield, color: BRAND_COLORS.success, bgColor: 'bg-green-50' },
  member: { icon: Users, color: BRAND_COLORS.warning, bgColor: 'bg-orange-50' },
  viewer: { icon: Eye, color: BRAND_COLORS.gray, bgColor: 'bg-gray-50' },
};

// ============================================================================
// UTILITIES
// ============================================================================

function getInitials(member: TeamMember): string {
  if (member.first_name && member.last_name) {
    return (member.first_name[0] + member.last_name[0]).toUpperCase();
  }
  if (member.first_name) {
    return member.first_name.substring(0, 2).toUpperCase();
  }
  if (member.full_name) {
    const parts = member.full_name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return member.full_name.substring(0, 2).toUpperCase();
  }
  return member.email.substring(0, 2).toUpperCase();
}

function getDisplayName(member: TeamMember): string {
  if (member.first_name && member.last_name) {
    return `${member.first_name} ${member.last_name}`;
  }
  if (member.first_name) {
    return member.first_name;
  }
  if (member.full_name) {
    return member.full_name;
  }
  return member.email.split('@')[0];
}

function formatDateFR(iso: string | null): string {
  if (!iso) return '-';
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return '-';
  }
}

function getRelativeTime(iso: string | null, language: 'en' | 'fr'): string {
  if (!iso) return '-';
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return language === 'fr' ? "Aujourd'hui" : 'Today';
    if (diffDays === 1) return language === 'fr' ? 'Hier' : 'Yesterday';
    if (diffDays < 7) return language === 'fr' ? `Il y a ${diffDays} jours` : `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return language === 'fr' ? `Il y a ${weeks} semaine${weeks > 1 ? 's' : ''}` : `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    return formatDateFR(iso);
  } catch {
    return '-';
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TeamPage() {
  const { language } = useLanguage();
  const t = createTranslator(language);
  const supabase = createClient();

  // State
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState<TeamStats>({ total: 0, admins: 0, members: 0, viewers: 0, pendingInvites: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Current user
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<RoleType | null>(null);

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [newRole, setNewRole] = useState<RoleType | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleType>('member');
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Invitations
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    fetchTeamData();
  }, []);

  async function fetchTeamData() {
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
      const { data: membersData, error } = await supabase
        .from('users')
        .select('*')
        .eq('organization_id', userData.organization_id)
        .order('role', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;

      const teamMembers = (membersData || []) as TeamMember[];
      setMembers(teamMembers);

      // Fetch pending invitations
      let pendingCount = 0;
      try {
        const inviteRes = await fetch('/api/team/invitations');
        if (inviteRes.ok) {
          const inviteData = await inviteRes.json();
          setInvitations(inviteData.invitations || []);
          pendingCount = (inviteData.invitations || []).filter(
            (inv: TeamInvitation) => inv.status === 'pending'
          ).length;
        }
      } catch {
        // Silently fail - invitations are non-critical
      }

      // Calculate stats
      setStats({
        total: teamMembers.length,
        admins: teamMembers.filter(m => m.role === 'owner' || m.role === 'admin').length,
        members: teamMembers.filter(m => m.role === 'member').length,
        viewers: teamMembers.filter(m => m.role === 'viewer').length,
        pendingInvites: pendingCount,
      });
    } catch (err) {
      console.error('Error fetching team:', err);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  async function handleChangeRole() {
    if (!selectedMember || !newRole) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', selectedMember.id);

      if (error) throw error;

      setShowRoleModal(false);
      setSelectedMember(null);
      fetchTeamData();
    } catch (err) {
      console.error('Error changing role:', err);
    } finally {
      setSending(false);
    }
  }

  async function handleRemoveMember() {
    if (!selectedMember) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ organization_id: null })
        .eq('id', selectedMember.id);

      if (error) throw error;

      setShowRemoveModal(false);
      setSelectedMember(null);
      fetchTeamData();
    } catch (err) {
      console.error('Error removing member:', err);
    } finally {
      setSending(false);
    }
  }

  async function handleSendInvite() {
    if (!inviteEmail.trim()) return;

    setSending(true);
    setInviteError('');
    setInviteSuccess('');

    try {
      const response = await fetch('/api/team/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      const data = await response.json();

      if (!response.ok) {
        setInviteError(data.error || 'Failed to send invitation');
        return;
      }

      setInviteSuccess(
        language === 'fr'
          ? `Invitation envoyee a ${inviteEmail}`
          : `Invitation sent to ${inviteEmail}`
      );
      setInviteEmail('');
      setInviteRole('member');
      fetchTeamData();

      // Close modal after short delay
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteSuccess('');
      }, 1500);
    } catch {
      setInviteError(
        language === 'fr' ? 'Erreur lors de l\'envoi' : 'Failed to send invitation'
      );
    } finally {
      setSending(false);
    }
  }

  async function handleInvitationAction(invitationId: string, action: 'resend' | 'revoke') {
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (response.ok) {
        fetchTeamData();
      }
    } catch (err) {
      console.error('Error with invitation action:', err);
    }
  }

  // ============================================================================
  // PERMISSIONS
  // ============================================================================

  const canManageTeam = currentUserRole === 'owner' || currentUserRole === 'admin';

  function canEditMember(member: TeamMember): boolean {
    if (!canManageTeam) return false;
    if (member.id === currentUserId) return false;
    if (member.role === 'owner') return false;
    if (currentUserRole === 'admin' && member.role === 'admin') return false;
    return true;
  }

  // ============================================================================
  // FILTER LOGIC
  // ============================================================================

  const filteredMembers = members.filter(m => {
    // Search filter
    const displayName = getDisplayName(m);
    const matchesSearch = 
      displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    // Role filter
    switch (activeFilter) {
      case 'admins':
        return m.role === 'owner' || m.role === 'admin';
      case 'members':
        return m.role === 'member' || m.role === 'viewer';
      case 'pending':
        return false; // No pending members in users table (would be in invitations)
      case 'all':
      default:
        return true;
    }
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: BRAND_COLORS.primary }}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('team.pageTitle')}</h1>
          <p className="text-gray-600 mt-1">{t('team.pageSubtitle')}</p>
        </div>
        {canManageTeam && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-white rounded-lg font-medium"
            style={{ backgroundColor: BRAND_COLORS.primary }}
          >
            <UserPlus className="w-4 h-4" />
            {t('team.inviteMember')}
          </button>
        )}
      </div>

      {/* Stats - Clickable Filter Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Total Members */}
        <button
          onClick={() => setActiveFilter('all')}
          className={`bg-white rounded-lg p-5 text-left transition-all hover:shadow-md ${
            activeFilter === 'all' ? 'ring-2 ring-gray-400' : ''
          }`}
          style={{ 
            borderLeft: `4px solid ${BRAND_COLORS.gray}`, 
            borderBottom: `4px solid ${BRAND_COLORS.gray}`
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('team.totalMembers')}</p>
            <Users className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-1">{t('team.teamSize')}</p>
        </button>

        {/* Administrators */}
        <button
          onClick={() => setActiveFilter('admins')}
          className={`bg-white rounded-lg p-5 text-left transition-all hover:shadow-md ${
            activeFilter === 'admins' ? 'ring-2 ring-green-500' : ''
          }`}
          style={{ 
            borderLeft: `4px solid ${BRAND_COLORS.success}`, 
            borderBottom: `4px solid ${BRAND_COLORS.success}`
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('team.administrators')}</p>
            <Shield className="w-5 h-5" style={{ color: BRAND_COLORS.success }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.success }}>{stats.admins}</p>
          <p className="text-xs text-gray-500 mt-1">{t('team.fullAccess')}</p>
        </button>

        {/* Team Members */}
        <button
          onClick={() => setActiveFilter('members')}
          className={`bg-white rounded-lg p-5 text-left transition-all hover:shadow-md ${
            activeFilter === 'members' ? 'ring-2 ring-orange-500' : ''
          }`}
          style={{ 
            borderLeft: `4px solid ${BRAND_COLORS.warning}`, 
            borderBottom: `4px solid ${BRAND_COLORS.warning}`
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('team.teamMembers')}</p>
            <Users className="w-5 h-5" style={{ color: BRAND_COLORS.warning }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.warning }}>{stats.members + stats.viewers}</p>
          <p className="text-xs text-gray-500 mt-1">{t('team.standardAccess')}</p>
        </button>

        {/* Pending Invites */}
        <button
          onClick={() => setActiveFilter('pending')}
          className={`bg-white rounded-lg p-5 text-left transition-all hover:shadow-md ${
            activeFilter === 'pending' ? 'ring-2 ring-blue-500' : ''
          }`}
          style={{ 
            borderLeft: `4px solid ${BRAND_COLORS.primary}`, 
            borderBottom: `4px solid ${BRAND_COLORS.primary}`
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('team.pendingInvites')}</p>
            <Mail className="w-5 h-5" style={{ color: BRAND_COLORS.primary }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.primary }}>{stats.pendingInvites}</p>
          <p className="text-xs text-gray-500 mt-1">{t('team.awaitingResponse')}</p>
        </button>
      </div>

      {/* Active Filter Indicator */}
      {activeFilter !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            {language === 'fr' ? 'Filtré par:' : 'Filtered by:'}
          </span>
          <span 
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium text-white"
            style={{ 
              backgroundColor: activeFilter === 'admins' ? BRAND_COLORS.success : 
                              activeFilter === 'members' ? BRAND_COLORS.warning : 
                              BRAND_COLORS.primary 
            }}
          >
            {activeFilter === 'admins' && (language === 'fr' ? 'Administrateurs' : 'Administrators')}
            {activeFilter === 'members' && (language === 'fr' ? 'Membres' : 'Members')}
            {activeFilter === 'pending' && (language === 'fr' ? 'En attente' : 'Pending')}
            <button 
              onClick={() => setActiveFilter('all')}
              className="ml-1 hover:bg-white/20 rounded-full p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('team.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Members List */}
      {filteredMembers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">
            {activeFilter === 'pending' 
              ? (language === 'fr' ? 'Aucune invitation en attente' : 'No pending invitations')
              : t('team.noMembers')
            }
          </h3>
          <p className="text-gray-500 mt-1">
            {activeFilter === 'pending'
              ? (language === 'fr' ? 'Toutes les invitations ont été acceptées' : 'All invitations have been accepted')
              : activeFilter !== 'all'
                ? (language === 'fr' ? 'Aucun membre dans cette catégorie' : 'No members in this category')
                : t('team.noMembersDesc')
            }
          </p>
          {activeFilter !== 'all' && (
            <button
              onClick={() => setActiveFilter('all')}
              className="mt-4 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              {language === 'fr' ? 'Voir tous les membres' : 'View all members'}
            </button>
          )}
          {activeFilter === 'all' && canManageTeam && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="mt-4 px-4 py-2 text-white rounded-lg text-sm font-medium"
              style={{ backgroundColor: BRAND_COLORS.primary }}
            >
              {t('team.inviteMember')}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('team.member')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('team.role')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('team.joined')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('team.lastActive')}
                </th>
                {canManageTeam && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('team.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredMembers.map((member) => {
                const roleConfig = ROLE_CONFIG[member.role];
                const RoleIcon = roleConfig.icon;
                const isCurrentUser = member.id === currentUserId;

                return (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm"
                          style={{ backgroundColor: BRAND_COLORS.primary }}
                        >
                          {getInitials(member)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">
                              {getDisplayName(member)}
                            </p>
                            {isCurrentUser && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                {language === 'fr' ? 'Vous' : 'You'}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleConfig.bgColor}`}
                        style={{ color: roleConfig.color }}
                      >
                        <RoleIcon className="w-3.5 h-3.5" />
                        {t(`team.role${member.role.charAt(0).toUpperCase() + member.role.slice(1)}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateFR(member.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getRelativeTime(member.updated_at || member.created_at, language)}
                    </td>
                    {canManageTeam && (
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {canEditMember(member) ? (
                          <div className="relative inline-block text-left">
                            <MemberActions
                              member={member}
                              onEditRole={() => {
                                setSelectedMember(member);
                                setNewRole(member.role);
                                setShowRoleModal(true);
                              }}
                              onRemove={() => {
                                setSelectedMember(member);
                                setShowRemoveModal(true);
                              }}
                              language={language}
                            />
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending Invitations Section */}
      {canManageTeam && invitations.length > 0 && (activeFilter === 'all' || activeFilter === 'pending') && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Mail className="w-4 h-4" style={{ color: BRAND_COLORS.primary }} />
              {language === 'fr' ? 'Invitations en attente' : 'Pending Invitations'}
              <span
                className="ml-1 px-2 py-0.5 rounded-full text-xs text-white"
                style={{ backgroundColor: BRAND_COLORS.primary }}
              >
                {invitations.filter(i => i.status === 'pending').length}
              </span>
            </h3>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('team.role')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {language === 'fr' ? 'Envoyee le' : 'Sent'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {t('team.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {invitations.map((invitation) => {
                const isExpired = new Date(invitation.expires_at) < new Date() && invitation.status === 'pending';
                return (
                  <tr key={invitation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100">
                          <Mail className="w-4 h-4 text-gray-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-900">{invitation.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50" style={{ color: BRAND_COLORS.primary }}>
                        {invitation.role === 'admin'
                          ? (language === 'fr' ? 'Administrateur' : 'Admin')
                          : invitation.role === 'viewer'
                            ? (language === 'fr' ? 'Lecteur' : 'Viewer')
                            : (language === 'fr' ? 'Membre' : 'Member')
                        }
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateFR(invitation.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isExpired ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
                          <Clock className="w-3 h-3" />
                          {language === 'fr' ? 'Expiree' : 'Expired'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                          <Clock className="w-3 h-3" />
                          {language === 'fr' ? 'En attente' : 'Pending'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleInvitationAction(invitation.id, 'resend')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                          title={language === 'fr' ? 'Renvoyer' : 'Resend'}
                        >
                          <RefreshCw className="w-3 h-3" />
                          {language === 'fr' ? 'Renvoyer' : 'Resend'}
                        </button>
                        <button
                          onClick={() => handleInvitationAction(invitation.id, 'revoke')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                          title={language === 'fr' ? 'Revoquer' : 'Revoke'}
                        >
                          <X className="w-3 h-3" />
                          {language === 'fr' ? 'Revoquer' : 'Revoke'}
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

      {/* Change Role Modal */}
      {showRoleModal && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">{t('team.changeRole')}</h3>
              <button onClick={() => setShowRoleModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600">
                {t('team.changeRoleFor')} <strong>{getDisplayName(selectedMember)}</strong>
              </p>
              <div className="space-y-2">
                {(['admin', 'member', 'viewer'] as RoleType[]).map((role) => {
                  const config = ROLE_CONFIG[role];
                  const Icon = config.icon;
                  return (
                    <label
                      key={role}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                        newRole === role ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        checked={newRole === role}
                        onChange={() => setNewRole(role)}
                        className="sr-only"
                      />
                      <div className={`p-2 rounded-lg ${config.bgColor}`}>
                        <Icon className="w-4 h-4" style={{ color: config.color }} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {t(`team.role${role.charAt(0).toUpperCase() + role.slice(1)}`)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t(`team.role${role.charAt(0).toUpperCase() + role.slice(1)}Desc`)}
                        </p>
                      </div>
                      {newRole === role && (
                        <Check className="w-5 h-5 text-blue-500" />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowRoleModal(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleChangeRole}
                disabled={sending || newRole === selectedMember.role}
                className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: BRAND_COLORS.primary }}
              >
                {sending ? t('common.loading') : t('team.updateRole')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Modal */}
      {showRemoveModal && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">{t('team.removeMember')}</h3>
              <button onClick={() => setShowRemoveModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-800">
                    {t('team.removeWarning')}
                  </p>
                  <p className="text-sm text-red-700 mt-2 font-medium">
                    {getDisplayName(selectedMember)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowRemoveModal(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleRemoveMember}
                disabled={sending}
                className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: BRAND_COLORS.danger }}
              >
                {sending ? t('common.loading') : t('team.confirmRemove')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">{t('team.inviteMember')}</h3>
              <button onClick={() => setShowInviteModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('team.emailAddress')}
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('team.selectRole')}
                </label>
                <div className="space-y-2">
                  {(['admin', 'member', 'viewer'] as RoleType[]).map((role) => {
                    const config = ROLE_CONFIG[role];
                    const Icon = config.icon;
                    return (
                      <label
                        key={role}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                          inviteRole === role ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="inviteRole"
                          checked={inviteRole === role}
                          onChange={() => setInviteRole(role)}
                          className="sr-only"
                        />
                        <div className={`p-2 rounded-lg ${config.bgColor}`}>
                          <Icon className="w-4 h-4" style={{ color: config.color }} />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {t(`team.role${role.charAt(0).toUpperCase() + role.slice(1)}`)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t(`team.role${role.charAt(0).toUpperCase() + role.slice(1)}Desc`)}
                          </p>
                        </div>
                        {inviteRole === role && (
                          <Check className="w-5 h-5 text-blue-500" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
              {inviteError && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-800">{inviteError}</p>
                </div>
              )}
              {inviteSuccess && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-800">{inviteSuccess}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
              <button
                onClick={() => { setShowInviteModal(false); setInviteError(''); setInviteSuccess(''); }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSendInvite}
                disabled={sending || !inviteEmail.trim()}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: BRAND_COLORS.primary }}
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                {sending
                  ? (language === 'fr' ? 'Envoi...' : 'Sending...')
                  : t('team.sendInvite')
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MEMBER ACTIONS DROPDOWN
// ============================================================================

function MemberActions({
  member,
  onEditRole,
  onRemove,
  language,
}: {
  member: TeamMember;
  onEditRole: () => void;
  onRemove: () => void;
  language: 'en' | 'fr';
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
            <button
              onClick={() => {
                setOpen(false);
                onEditRole();
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Edit className="w-4 h-4" />
              {language === 'fr' ? 'Modifier le rôle' : 'Change role'}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              {language === 'fr' ? 'Retirer de l\'équipe' : 'Remove from team'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}