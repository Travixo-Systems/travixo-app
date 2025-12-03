// ============================================================================
// FILE: app/(dashboard)/team/page.tsx
// PURPOSE: Team management - invite members, change roles, remove members
// COPY TO: your-project/app/(dashboard)/team/page.tsx
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

type RoleType = 'owner' | 'admin' | 'member' | 'viewer';

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  role: RoleType;
  organization_id: string;
  created_at: string;
  updated_at: string | null;
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

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
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
    return iso;
  }
}

function formatRelativeTime(iso: string | null, language: 'en' | 'fr'): string {
  if (!iso) return '-';
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return language === 'fr' ? "Aujourd'hui" : 'Today';
    if (diffDays === 1) return language === 'fr' ? 'Hier' : 'Yesterday';
    if (diffDays < 7) return `${diffDays} ${language === 'fr' ? 'jours' : 'days ago'}`;
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${language === 'fr' ? 'semaines' : 'weeks ago'}`;
  } catch {
    return iso;
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
  const [members, setMembers] = useState<TeamMember[]>([]);
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
  const [newRole, setNewRole] = useState<RoleType>('member');
  const [sending, setSending] = useState(false);

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

      // Calculate stats
      setStats({
        total: teamMembers.length,
        admins: teamMembers.filter(m => m.role === 'owner' || m.role === 'admin').length,
        members: teamMembers.filter(m => m.role === 'member').length,
        viewers: teamMembers.filter(m => m.role === 'viewer').length,
        pendingInvites: 0, // Would come from team_invitations table
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
  // FILTER
  // ============================================================================

  const filteredMembers = members.filter(m =>
    (m.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     m.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div
          className="bg-white rounded-lg p-5"
          style={{ borderLeft: `4px solid ${BRAND_COLORS.gray}`, borderBottom: `4px solid ${BRAND_COLORS.gray}` }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('team.totalMembers')}</p>
            <Users className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-1">{t('team.teamSize')}</p>
        </div>

        <div
          className="bg-white rounded-lg p-5"
          style={{ borderLeft: `4px solid ${BRAND_COLORS.success}`, borderBottom: `4px solid ${BRAND_COLORS.success}` }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('team.administrators')}</p>
            <Shield className="w-5 h-5" style={{ color: BRAND_COLORS.success }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.success }}>{stats.admins}</p>
          <p className="text-xs text-gray-500 mt-1">{t('team.fullAccess')}</p>
        </div>

        <div
          className="bg-white rounded-lg p-5"
          style={{ borderLeft: `4px solid ${BRAND_COLORS.warning}`, borderBottom: `4px solid ${BRAND_COLORS.warning}` }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('team.teamMembers')}</p>
            <Users className="w-5 h-5" style={{ color: BRAND_COLORS.warning }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.warning }}>{stats.members + stats.viewers}</p>
          <p className="text-xs text-gray-500 mt-1">{t('team.standardAccess')}</p>
        </div>

        <div
          className="bg-white rounded-lg p-5"
          style={{ borderLeft: `4px solid ${BRAND_COLORS.primary}`, borderBottom: `4px solid ${BRAND_COLORS.primary}` }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">{t('team.pendingInvites')}</p>
            <Mail className="w-5 h-5" style={{ color: BRAND_COLORS.primary }} />
          </div>
          <p className="text-3xl font-bold mt-2" style={{ color: BRAND_COLORS.primary }}>{stats.pendingInvites}</p>
          <p className="text-xs text-gray-500 mt-1">{t('team.awaitingResponse')}</p>
        </div>
      </div>

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
          <h3 className="text-lg font-medium text-gray-900">{t('team.noMembers')}</h3>
          <p className="text-gray-500 mt-1">{t('team.noMembersDesc')}</p>
          {canManageTeam && (
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
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                          style={{ backgroundColor: BRAND_COLORS.primary }}
                        >
                          {getInitials(member.full_name, member.email)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {member.full_name || member.email}
                            </span>
                            {isCurrentUser && (
                              <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                {language === 'fr' ? 'Vous' : 'You'}
                              </span>
                            )}
                          </div>
                          {member.full_name && (
                            <span className="text-sm text-gray-500">{member.email}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${roleConfig.bgColor}`}
                        style={{ color: roleConfig.color }}
                      >
                        <RoleIcon className="w-3.5 h-3.5" />
                        {t(`team.role${member.role.charAt(0).toUpperCase() + member.role.slice(1)}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDateFR(member.created_at)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatRelativeTime(member.updated_at || member.created_at, language)}
                    </td>
                    {canManageTeam && (
                      <td className="px-6 py-4 text-right">
                        {canEditMember(member) && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedMember(member);
                                setNewRole(member.role);
                                setShowRoleModal(true);
                              }}
                              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                              title={t('team.changeRole')}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedMember(member);
                                setShowRemoveModal(true);
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                              title={t('team.removeMember')}
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
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">{t('team.inviteMemberTitle')}</h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('team.emailAddress')}
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t('team.emailPlaceholder')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('team.selectRole')}
                </label>
                <div className="space-y-2">
                  {(['admin', 'member', 'viewer'] as const).map((role) => {
                    const config = ROLE_CONFIG[role];
                    const Icon = config.icon;
                    return (
                      <button
                        key={role}
                        onClick={() => setInviteRole(role)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          inviteRole === role
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${config.color}15` }}
                        >
                          <Icon className="w-5 h-5" style={{ color: config.color }} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-gray-900">
                            {t(`team.role${role.charAt(0).toUpperCase() + role.slice(1)}`)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t(`team.role${role.charAt(0).toUpperCase() + role.slice(1)}Desc`)}
                          </p>
                        </div>
                        {inviteRole === role && (
                          <Check className="w-5 h-5 text-blue-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200"
              >
                {t('common.cancel')}
              </button>
              <button
                disabled={!inviteEmail.trim() || sending}
                className="flex-1 px-4 py-2.5 text-white rounded-lg font-medium disabled:opacity-50"
                style={{ backgroundColor: BRAND_COLORS.primary }}
              >
                {sending ? t('team.sending') : t('team.sendInvite')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {showRoleModal && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">{t('team.changeRoleTitle')}</h2>
              <button
                onClick={() => { setShowRoleModal(false); setSelectedMember(null); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">{selectedMember.full_name || selectedMember.email}</p>
              <p className="text-xs text-gray-500">{t('team.currentRole')}: {t(`team.role${selectedMember.role.charAt(0).toUpperCase() + selectedMember.role.slice(1)}`)}</p>
            </div>

            <div className="space-y-2">
              {(['admin', 'member', 'viewer'] as const).map((role) => {
                const config = ROLE_CONFIG[role];
                const Icon = config.icon;
                const isDisabled = currentUserRole === 'admin' && role === 'admin';
                
                return (
                  <button
                    key={role}
                    onClick={() => !isDisabled && setNewRole(role)}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      newRole === role
                        ? 'border-blue-500 bg-blue-50'
                        : isDisabled
                        ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${config.color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: config.color }} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-gray-900">
                        {t(`team.role${role.charAt(0).toUpperCase() + role.slice(1)}`)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {t(`team.role${role.charAt(0).toUpperCase() + role.slice(1)}Desc`)}
                      </p>
                    </div>
                    {newRole === role && (
                      <Check className="w-5 h-5 text-blue-600" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => { setShowRoleModal(false); setSelectedMember(null); }}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleChangeRole}
                disabled={newRole === selectedMember.role || sending}
                className="flex-1 px-4 py-2.5 text-white rounded-lg font-medium disabled:opacity-50"
                style={{ backgroundColor: BRAND_COLORS.primary }}
              >
                {t('team.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Modal */}
      {showRemoveModal && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">{t('team.removeMemberTitle')}</h2>
              <button
                onClick={() => { setShowRemoveModal(false); setSelectedMember(null); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <p className="text-sm text-red-800">{t('team.removeMemberDesc')}</p>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg mb-6">
              <p className="font-medium text-gray-900">{selectedMember.full_name || selectedMember.email}</p>
              <p className="text-sm text-gray-500">{selectedMember.email}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowRemoveModal(false); setSelectedMember(null); }}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleRemoveMember}
                disabled={sending}
                className="flex-1 px-4 py-2.5 text-white rounded-lg font-medium disabled:opacity-50"
                style={{ backgroundColor: BRAND_COLORS.danger }}
              >
                {t('team.removeConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}