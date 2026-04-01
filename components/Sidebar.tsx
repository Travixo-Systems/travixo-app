// components/Sidebar.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import {
  HomeIcon,
  CubeIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CreditCardIcon,
  ChevronLeftIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { AlertCircle, Calendar, FileText, History } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';
import { LanguageToggle } from './LanguageToggle';
import { useTheme } from '@/lib/ThemeContext';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

const MOBILE_BREAKPOINT = 1026;
const SIDEBAR_BG = '#0a2730';

export default function Sidebar() {
  const pathname = usePathname();
  const { language, setLanguage } = useLanguage();
  const t = createTranslator(language);
  const { colors, logo, orgName } = useTheme();

  // Locale-aware path matching
  const normalizedPath = pathname.replace(/^\/(fr|en)(?=\/|$)/, '') || '/';
  const isVgpRoute = normalizedPath.startsWith('/vgp');
  const isActivePath = (href: string) => normalizedPath === href;

  // State
  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [vgpOpen, setVgpOpen] = useState(isVgpRoute);
  const [vgpFlyout, setVgpFlyout] = useState(false);
  const [user, setUser] = useState<{ firstName: string; lastName: string; email: string } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const supabase = createClient();

  // ── Responsive: detect mobile ──
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
        setMobileOpen(false);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Desktop: persist collapsed state ──
  useEffect(() => {
    if (!isMobile) {
      const saved = localStorage.getItem('sidebar-collapsed');
      if (saved) setCollapsed(JSON.parse(saved));
    }
  }, [isMobile]);

  // ── Close everything on navigation ──
  useEffect(() => {
    setVgpOpen(isVgpRoute);
    setVgpFlyout(false);
    setMobileOpen(false);
  }, [isVgpRoute, pathname]);

  // ── Fetch user ──
  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data } = await supabase
        .from('users')
        .select('first_name, last_name, email')
        .eq('id', authUser.id)
        .single();
      if (data) {
        setUser({ firstName: data.first_name || '', lastName: data.last_name || '', email: data.email });
      }
    })();
  }, []);

  const toggleDesktopCollapse = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', JSON.stringify(next));
  }, [collapsed]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
  };

  const getInitials = () => {
    if (user?.firstName && user?.lastName) return (user.firstName[0] + user.lastName[0]).toUpperCase();
    if (user?.firstName) return user.firstName.substring(0, 2).toUpperCase();
    if (user?.email) return user.email.substring(0, 2).toUpperCase();
    return '??';
  };

  const getDisplayName = () => {
    if (user?.firstName && user?.lastName) return `${user.firstName} ${user.lastName}`;
    if (user?.firstName) return user.firstName;
    return user?.email?.split('@')[0] || '';
  };

  // ── Navigation data ──
  const navigation = [
    { name: t('navigation.dashboard'), href: '/dashboard', icon: HomeIcon },
    { name: t('navigation.assets'), href: '/assets', icon: CubeIcon },
    { name: t('navigation.audits'), href: '/audits', icon: ClipboardDocumentListIcon },
    { name: t('navigation.clients'), href: '/clients', icon: UserGroupIcon },
    { name: t('navigation.team'), href: '/team', icon: UsersIcon },
    { name: t('navigation.settings'), href: '/settings', icon: Cog6ToothIcon },
    { name: t('navigation.subscription'), href: '/settings/subscription', icon: CreditCardIcon },
  ];

  const vgpNavigation = [
    { name: t('navigation.vgpOverview'), href: '/vgp', icon: AlertCircle },
    { name: t('navigation.vgpSchedules'), href: '/vgp/schedules', icon: Calendar },
    { name: t('navigation.vgpReport'), href: '/vgp/report', icon: FileText },
    { name: t('navigation.vgpInspections'), href: '/vgp/inspections', icon: History },
  ];

  // Whether sidebar content is in "expanded" (showing labels) mode
  const isExpanded = isMobile ? mobileOpen : !collapsed;

  // ── Shared sub-components ──

  const OrgLogo = ({ size = 32 }: { size?: number }) => (
    logo ? (
      <Image src={logo} alt={orgName} width={size} height={size} className="w-8 h-8 object-contain rounded flex-shrink-0" />
    ) : (
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 text-white text-xs font-bold tracking-wide"
        style={{ backgroundColor: '#f26f00' }}
      >
        {orgName.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
      </span>
    )
  );

  const NavItem = ({ item, showLabel }: { item: typeof navigation[0]; showLabel: boolean }) => {
    const Icon = item.icon;
    const isActive = isActivePath(item.href);
    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={() => isMobile && setMobileOpen(false)}
        className={cn(
          'flex items-center px-4 min-h-[44px] text-sm font-medium rounded-lg transition-colors',
          isActive ? 'text-white border-l-2 border-[#e8600a]' : 'text-white/70 hover:text-white',
          !showLabel && 'justify-center',
        )}
        style={isActive ? { backgroundColor: 'rgba(226,128,38,0.15)' } : undefined}
        title={!showLabel ? item.name : undefined}
      >
        <Icon className={cn('w-5 h-5', showLabel && 'mr-3')} />
        {showLabel && <span>{item.name}</span>}
      </Link>
    );
  };

  // ── VGP section renderer ──
  const renderVgpSection = (showLabel: boolean) => (
    <div className="relative" style={{ overflow: 'visible' }}>
      <button
        onClick={() => {
          if (showLabel) {
            setVgpOpen(!vgpOpen);
          } else {
            setVgpFlyout(!vgpFlyout);
          }
        }}
        className={cn(
          'w-full flex items-center justify-between px-4 min-h-[44px] text-sm font-medium rounded-lg transition-colors',
          isVgpRoute ? 'text-white border-l-2 border-[#e8600a]' : 'text-white/70 hover:text-white',
          !showLabel && 'justify-center',
        )}
        style={isVgpRoute ? { backgroundColor: 'rgba(226,128,38,0.15)' } : undefined}
        title={!showLabel ? t('navigation.vgp') : undefined}
      >
        <div className={cn('flex items-center', !showLabel && 'justify-center w-full')}>
          <AlertCircle className={cn('w-5 h-5', showLabel && 'mr-3')} />
          {showLabel && <span>{t('navigation.vgp')}</span>}
        </div>
        {showLabel && (vgpOpen ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />)}
      </button>

      {/* Expanded inline sub-menu */}
      {vgpOpen && showLabel && (
        <div className="mt-1 ml-4 space-y-1">
          {vgpNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = isActivePath(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => isMobile && setMobileOpen(false)}
                className={cn(
                  'flex items-center px-4 min-h-[44px] text-sm rounded-lg transition-colors',
                  isActive ? 'text-white font-medium border-l-2 border-[#e8600a]' : 'text-gray-400 hover:text-white',
                )}
                style={isActive ? { backgroundColor: 'rgba(226,128,38,0.15)' } : undefined}
              >
                <Icon className="w-4 h-4 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </div>
      )}

      {/* Collapsed flyout */}
      {vgpFlyout && !showLabel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setVgpFlyout(false)} />
          <div
            className="absolute left-full top-0 z-50 py-2"
            style={{ width: 180, backgroundColor: SIDEBAR_BG, borderRadius: '0 8px 8px 0' }}
          >
            {vgpNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = isActivePath(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => { setVgpFlyout(false); if (isMobile) setMobileOpen(false); }}
                  className="flex items-center px-4 text-[13px] text-white transition-colors"
                  style={{
                    minHeight: 44,
                    backgroundColor: isActive ? 'rgba(232,96,10,0.15)' : undefined,
                    borderLeft: isActive ? '2px solid #e8600a' : '2px solid transparent',
                  }}
                >
                  <Icon className="w-4 h-4 mr-3 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  // ── User section renderer ──
  const renderUserSection = (showLabel: boolean) => (
    <div className="border-t border-gray-800 flex-shrink-0">
      {user && (
        <div className={cn('p-3', !showLabel && 'p-2')}>
          {showLabel ? (
            <div className="flex items-center gap-2">
              <Link
                href="/settings/profile"
                onClick={() => isMobile && setMobileOpen(false)}
                className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
              >
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold" style={{ backgroundColor: colors.secondary }}>
                  {getInitials()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{getDisplayName()}</p>
                </div>
              </Link>
              <button onClick={handleLogout} disabled={loggingOut} className="p-1.5 text-gray-400 hover:text-red-400 rounded transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center" title={language === 'fr' ? 'Déconnexion' : 'Logout'}>
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity" style={{ backgroundColor: colors.secondary }} title={getDisplayName()}>
                {getInitials()}
              </div>
              <button onClick={handleLogout} disabled={loggingOut} className="p-1.5 text-gray-400 hover:text-red-400 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center" title={language === 'fr' ? 'Déconnexion' : 'Logout'}>
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className={cn('pb-2', !showLabel ? 'px-1' : 'px-2')}>
        {!showLabel ? (
          <button
            onClick={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
            className="inline-flex items-center justify-center w-full min-h-[44px] py-2.5 rounded-lg text-xs font-bold text-gray-300 hover:text-white hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
            aria-label={`Langue : ${language.toUpperCase()}`}
            title={`Basculer vers ${language === 'fr' ? 'English' : 'Français'}`}
          >
            {language.toUpperCase()}
          </button>
        ) : (
          <LanguageToggle />
        )}
      </div>
    </div>
  );

  // ── Full sidebar content (used for both desktop expanded + mobile overlay) ──
  const renderSidebarContent = (showLabel: boolean) => (
    <>
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto" style={{ overflowX: 'visible' }}>
        {navigation.slice(0, 2).map((item) => <NavItem key={item.href} item={item} showLabel={showLabel} />)}
        {renderVgpSection(showLabel)}
        {navigation.slice(2).map((item) => <NavItem key={item.href} item={item} showLabel={showLabel} />)}
      </nav>
      {renderUserSection(showLabel)}
    </>
  );

  // ════════════════════════════════════════════════
  // MOBILE LAYOUT (<1026px)
  // ════════════════════════════════════════════════
  if (isMobile) {
    return (
      <>
        {/* Icon rail — always visible */}
        <div
          className="flex flex-col h-screen w-16 flex-shrink-0 border-r border-gray-800"
          style={{ backgroundColor: SIDEBAR_BG, overflow: 'visible' }}
        >
          {/* Hamburger header */}
          <div className="flex items-center justify-center h-16 border-b border-gray-800 flex-shrink-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex items-center justify-center h-11 w-11 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
              aria-label={language === 'fr' ? 'Ouvrir le menu' : 'Open menu'}
            >
              <Bars3Icon className="w-5 h-5" />
            </button>
          </div>

          {/* Icon-only nav */}
          {renderSidebarContent(false)}
        </div>

        {/* Mobile overlay — full sidebar */}
        {mobileOpen && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
            <div
              className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col"
              style={{ backgroundColor: SIDEBAR_BG }}
            >
              {/* Header with close */}
              <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800 flex-shrink-0">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <OrgLogo />
                  <h1 className="text-xl font-bold truncate" style={{ color: '#e8600a' }} title={orgName}>
                    {orgName}
                  </h1>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center h-11 w-11 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
                  aria-label={language === 'fr' ? 'Fermer le menu' : 'Close menu'}
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Full nav with labels */}
              {renderSidebarContent(true)}
            </div>
          </>
        )}
      </>
    );
  }

  // ════════════════════════════════════════════════
  // DESKTOP LAYOUT (>=1026px)
  // ════════════════════════════════════════════════
  return (
    <div
      className={cn('flex flex-col h-screen border-r border-gray-800 transition-all duration-300', collapsed ? 'w-16' : 'w-64')}
      style={{ backgroundColor: SIDEBAR_BG, overflow: 'visible' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800 flex-shrink-0" style={{ backgroundColor: SIDEBAR_BG }}>
        {!collapsed && (
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <OrgLogo />
            <h1 className="text-xl font-bold truncate" style={{ color: '#e8600a' }} title={orgName}>{orgName}</h1>
          </div>
        )}
        {collapsed && (
          <div className="flex-1 flex justify-center"><OrgLogo /></div>
        )}
        <button
          onClick={toggleDesktopCollapse}
          className="flex items-center justify-center h-11 w-11 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
          aria-label={collapsed ? 'Agrandir la barre latérale' : 'Réduire la barre latérale'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <Bars3Icon className="w-5 h-5" /> : <ChevronLeftIcon className="w-5 h-5" />}
        </button>
      </div>

      {/* Nav content */}
      {renderSidebarContent(isExpanded)}
    </div>
  );
}
