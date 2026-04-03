// components/Sidebar.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const vgpButtonRef = useRef<HTMLButtonElement>(null);
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
          'flex items-center rounded-lg transition-colors',
          showLabel ? 'min-h-[48px] px-4 text-sm font-semibold' : 'min-h-[40px] justify-center px-2',
          isActive ? 'text-white border-l-2 border-[#e8600a]' : 'text-white/70 hover:text-white',
        )}
        style={isActive ? { backgroundColor: 'rgba(226,128,38,0.15)' } : undefined}
        title={!showLabel ? item.name : undefined}
      >
        <Icon className={cn(showLabel ? 'w-5 h-5 mr-3' : 'w-6 h-6')} />
        {showLabel && <span>{item.name}</span>}
      </Link>
    );
  };

  // ── VGP section renderer ──
  const openFlyout = () => {
    const rect = vgpButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setFlyoutPos({ top: rect.top, left: rect.right });
    }
    setVgpFlyout(true);
  };

  const renderVgpSection = (showLabel: boolean) => (
    <div>
      <button
        ref={!showLabel ? vgpButtonRef : undefined}
        onClick={() => {
          if (showLabel) {
            setVgpOpen(!vgpOpen);
          } else {
            if (vgpFlyout) { setVgpFlyout(false); } else { openFlyout(); }
          }
        }}
        className={cn(
          'w-full flex items-center justify-between rounded-lg transition-colors',
          showLabel ? 'min-h-[48px] px-4 text-sm font-semibold' : 'min-h-[40px] justify-center px-2',
          isVgpRoute ? 'text-white border-l-2 border-[#e8600a]' : 'text-white/70 hover:text-white',
        )}
        style={isVgpRoute ? { backgroundColor: 'rgba(226,128,38,0.15)' } : undefined}
        title={!showLabel ? t('navigation.vgp') : undefined}
      >
        <div className={cn('flex items-center', !showLabel && 'justify-center w-full')}>
          <AlertCircle className={cn(showLabel ? 'w-5 h-5 mr-3' : 'w-6 h-6')} />
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
                onClick={() => { if (isMobile) setMobileOpen(false); }}
                className={cn(
                  'flex items-center px-4 min-h-[48px] text-sm rounded-lg transition-colors',
                  isActive ? 'text-white font-semibold border-l-2 border-[#e8600a]' : 'text-gray-400 hover:text-white',
                )}
                style={isActive ? { backgroundColor: 'rgba(226,128,38,0.15)' } : undefined}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </div>
      )}

      {/* Collapsed flyout — rendered via portal to document.body */}
      {vgpFlyout && !showLabel && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setVgpFlyout(false)} />
          <div
            className="fixed py-2"
            style={{
              zIndex: 9999,
              top: flyoutPos.top,
              left: flyoutPos.left,
              width: 180,
              backgroundColor: SIDEBAR_BG,
              borderRadius: '0 8px 8px 0',
            }}
          >
            {vgpNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = isActivePath(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => { setVgpFlyout(false); if (isMobile) setMobileOpen(false); }}
                  className="flex items-center px-4 text-[15px] font-semibold text-white transition-colors"
                  style={{
                    minHeight: 48,
                    backgroundColor: isActive ? 'rgba(232,96,10,0.15)' : undefined,
                    borderLeft: isActive ? '2px solid #e8600a' : '2px solid transparent',
                  }}
                >
                  <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );

  // ── User section renderer ──
  const renderUserSection = (showLabel: boolean) => (
    <div className={cn('flex-shrink-0', showLabel && 'border-t border-gray-800')}>
      {showLabel ? (
        <>
          {user && (
            <div className="p-3">
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
            </div>
          )}
          <div className="px-2 pb-2">
            <LanguageToggle />
          </div>
        </>
      ) : (
        <div className="p-1.5">
          <div
            className="flex flex-col items-center gap-3 rounded-lg"
            style={{ backgroundColor: 'rgba(232,96,10,0.2)', padding: 6 }}
          >
            {/* Language toggle */}
            <button
              onClick={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
              className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full text-[10px] font-bold text-white hover:opacity-80 transition-opacity"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              aria-label={`Langue : ${language.toUpperCase()}`}
              title={`Basculer vers ${language === 'fr' ? 'English' : 'Français'}`}
            >
              {language.toUpperCase()}
            </button>
            {/* Profile initials */}
            {user && (
              <Link
                href="/settings/profile"
                onClick={() => isMobile && setMobileOpen(false)}
                className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full text-[10px] font-bold text-white hover:opacity-80 transition-opacity"
                style={{ backgroundColor: '#e8600a' }}
                title={getDisplayName()}
              >
                {getInitials()}
              </Link>
            )}
            {/* Logout */}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex items-center justify-center w-[26px] h-[26px] text-gray-400 hover:text-red-400 rounded transition-colors"
              title={language === 'fr' ? 'Déconnexion' : 'Logout'}
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Full sidebar content (used for both desktop expanded + mobile overlay) ──
  const renderSidebarContent = (showLabel: boolean) => (
    <div className={cn('flex flex-col flex-1 min-h-0', !showLabel && 'justify-between')}>
      <nav
        className={cn(
          'px-2',
          showLabel ? 'flex-1 py-4 space-y-1 overflow-y-auto' : 'py-2 space-y-0 overflow-hidden',
        )}
        style={{ overflowX: 'hidden' }}
      >
        {navigation.slice(0, 2).map((item) => <NavItem key={item.href} item={item} showLabel={showLabel} />)}
        {renderVgpSection(showLabel)}
        {navigation.slice(2).map((item) => <NavItem key={item.href} item={item} showLabel={showLabel} />)}
      </nav>
      {renderUserSection(showLabel)}
    </div>
  );

  // ════════════════════════════════════════════════
  // MOBILE LAYOUT (<1026px)
  // ════════════════════════════════════════════════
  if (isMobile) {
    return (
      <>
        {/* Icon rail — always visible */}
        <div
          className="flex flex-col h-screen w-16 flex-shrink-0 border-r border-gray-800 overflow-hidden"
          style={{ backgroundColor: SIDEBAR_BG }}
        >
          {/* Hamburger header */}
          <div className="flex items-center justify-center h-16 border-b border-gray-800 flex-shrink-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex items-center justify-center h-12 w-12 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
              aria-label={language === 'fr' ? 'Ouvrir le menu' : 'Open menu'}
            >
              <Bars3Icon className="w-7 h-7" />
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
      style={{ backgroundColor: SIDEBAR_BG }}
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
