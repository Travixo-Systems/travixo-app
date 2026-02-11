// components/Sidebar.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
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
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';
import { AlertCircle, Calendar, FileText, History } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';
import { LanguageToggle } from './LanguageToggle';
import { useTheme } from '@/lib/ThemeContext';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

export default function Sidebar() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const t = createTranslator(language);
  const { colors, logo, orgName } = useTheme();
  const [vgpOpen, setVgpOpen] = useState(pathname.startsWith('/vgp'));
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<{ firstName: string; lastName: string; email: string } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const supabase = createClient();

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved) {
      setCollapsed(JSON.parse(saved));
    }
  }, []);

  // Auto-collapse VGP dropdown when navigating away from /vgp pages
  useEffect(() => {
    if (!pathname.startsWith('/vgp')) {
      setVgpOpen(false);
    } else {
      setVgpOpen(true);
    }
  }, [pathname]);

  // Fetch current user
  useEffect(() => {
    async function fetchUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data } = await supabase
          .from('users')
          .select('first_name, last_name, email')
          .eq('id', authUser.id)
          .single();
        
        if (data) {
          setUser({
            firstName: data.first_name || '',
            lastName: data.last_name || '',
            email: data.email
          });
        }
      }
    }
    fetchUser();
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', JSON.stringify(newState));
  };

  // Logout handler
  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    // LanguageContext will handle redirect to /login
  };

  // Get user initials
  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    if (user?.firstName) {
      return user.firstName.substring(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    return '??';
  };

  // Get display name
  const getDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) {
      return user.firstName;
    }
    return user?.email?.split('@')[0] || '';
  };

  // Main navigation with translations
  const navigation = [
    { name: t('navigation.dashboard'), href: '/dashboard', icon: HomeIcon },
    { name: t('navigation.assets'), href: '/assets', icon: CubeIcon },
    { name: t('navigation.audits'), href: '/audits', icon: ClipboardDocumentListIcon },
    { name: t('navigation.clients'), href: '/clients', icon: UserGroupIcon },
    { name: t('navigation.team'), href: '/team', icon: UsersIcon },
    { name: t('navigation.settings'), href: '/settings', icon: Cog6ToothIcon },
    { name: t('navigation.subscription'), href: '/settings/subscription', icon: CreditCardIcon },
  ];

  // VGP navigation with translations
  const vgpNavigation = [
    { name: t('navigation.vgpOverview'), href: '/vgp', icon: AlertCircle },
    { name: t('navigation.vgpSchedules'), href: '/vgp/schedules', icon: Calendar },
    { name: t('navigation.vgpReport'), href: '/vgp/report', icon: FileText },
    { name: t('navigation.vgpInspections'), href: '/vgp/inspections', icon: History },
  ];

  return (
    <div
      className={cn(
        "flex flex-col h-screen border-r border-gray-800 transition-all duration-300 overflow-hidden",
        collapsed ? "w-16" : "w-64"
      )}
      style={{ backgroundColor: colors.primary }}
    >
      {/* Logo & Toggle */}
      <div 
        className="flex items-center justify-between h-16 px-4 border-b border-gray-800 flex-shrink-0"
        style={{ backgroundColor: colors.primary }}
      >
        {!collapsed && (
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            {logo ? (
              <Image 
                src={logo} 
                alt={orgName} 
                width={32} 
                height={32} 
                className="w-8 h-8 object-contain rounded flex-shrink-0"
              />
            ) : null}
            <h1 
              className="text-xl font-bold text-white truncate" 
              title={orgName}
            >
              {orgName}
            </h1>
          </div>
        )}
        {collapsed && logo && (
          <Image 
            src={logo} 
            alt={orgName} 
            width={32} 
            height={32} 
            className="w-8 h-8 object-contain rounded mx-auto"
          />
        )}
        <button
          onClick={toggleCollapsed}
          className={cn(
            "p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0",
            collapsed && !logo && "mx-auto"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <Bars3Icon className="w-5 h-5" />
          ) : (
            <ChevronLeftIcon className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-hidden">
        {/* Dashboard and Assets */}
        {navigation.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors group relative",
                isActive
                  ? 'text-white'
                  : 'text-gray-300 hover:text-white',
                collapsed && "justify-center"
              )}
              style={isActive ? { backgroundColor: colors.secondary } : undefined}
              title={collapsed ? item.name : undefined}
            >
              <Icon className={cn("w-5 h-5", !collapsed && "mr-3")} />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}

        {/* VGP Dropdown Section */}
        <div>
          <button
            onClick={() => {
              if (collapsed) {
                setCollapsed(false);
                localStorage.setItem('sidebar-collapsed', JSON.stringify(false));
                setVgpOpen(true);
              } else {
                setVgpOpen(!vgpOpen);
              }
            }}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3 text-sm font-medium rounded-lg transition-colors",
              pathname.startsWith('/vgp')
                ? 'text-white'
                : 'text-gray-300 hover:text-white',
              collapsed && "justify-center"
            )}
            style={pathname.startsWith('/vgp') ? { backgroundColor: colors.secondary } : undefined}
            title={collapsed ? t('navigation.vgp') : undefined}
          >
            <div className={cn("flex items-center", collapsed && "justify-center w-full")}>
              <AlertCircle className={cn("w-5 h-5", !collapsed && "mr-3")} />
              {!collapsed && <span>{t('navigation.vgp')}</span>}
            </div>
            {!collapsed && (
              vgpOpen ? (
                <ChevronDownIcon className="w-4 h-4" />
              ) : (
                <ChevronRightIcon className="w-4 h-4" />
              )
            )}
          </button>

          {/* VGP Sub-menu */}
          {vgpOpen && !collapsed && (
            <div className="mt-1 ml-4 space-y-1">
              {vgpNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center px-4 py-2 text-sm rounded-lg transition-colors",
                      isActive
                        ? 'text-white font-medium'
                        : 'text-gray-400 hover:text-white'
                    )}
                    style={isActive ? { backgroundColor: colors.secondary } : undefined}
                  >
                    <Icon className="w-4 h-4 mr-3" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Audits, Team, Settings, Subscription */}
        {navigation.slice(2).map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href === '/settings/subscription' && pathname === '/settings/subscription');
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                isActive
                  ? 'text-white'
                  : 'text-gray-300 hover:text-white',
                collapsed && "justify-center"
              )}
              style={isActive ? { backgroundColor: colors.secondary } : undefined}
              title={collapsed ? item.name : undefined}
            >
              <Icon className={cn("w-5 h-5", !collapsed && "mr-3")} />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Section & Language Toggle - Bottom of Sidebar */}
      <div className="border-t border-gray-800 flex-shrink-0">
        {/* User Info - Compact */}
        {user && (
          <div className={cn("p-3", collapsed && "p-2")}>
            {!collapsed ? (
              // Expanded: Avatar + Name with inline logout
              <div className="flex items-center gap-2">
                <Link 
                  href="/settings/profile"
                  className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
                >
                  <div 
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold"
                    style={{ backgroundColor: colors.secondary }}
                  >
                    {getInitials()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{getDisplayName()}</p>
                  </div>
                </Link>
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="p-1.5 text-gray-400 hover:text-red-400 rounded transition-colors flex-shrink-0"
                  title={language === 'fr' ? 'Déconnexion' : 'Logout'}
                >
                  <ArrowRightOnRectangleIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              // Collapsed: Just avatar with logout tooltip
              <div className="flex items-center justify-center gap-1">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: colors.secondary }}
                  title={getDisplayName()}
                >
                  {getInitials()}
                </div>
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="p-1.5 text-gray-400 hover:text-red-400 rounded transition-colors"
                  title={language === 'fr' ? 'Déconnexion' : 'Logout'}
                >
                  <ArrowRightOnRectangleIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Language Toggle */}
        {!collapsed && (
          <div className="px-2 pb-2">
            <LanguageToggle />
          </div>
        )}
      </div>
    </div>
  );
}