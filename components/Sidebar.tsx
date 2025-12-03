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
  Cog6ToothIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CreditCardIcon,
  ChevronLeftIcon,
  Bars3Icon
} from '@heroicons/react/24/outline';
import { AlertCircle, Calendar, FileText, History } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';
import { LanguageToggle } from './LanguageToggle';
import { useTheme } from '@/lib/ThemeContext';
import { cn } from '@/lib/utils';

export default function Sidebar() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const t = createTranslator(language);
  const { colors, logo, orgName } = useTheme();
  const [vgpOpen, setVgpOpen] = useState(pathname.startsWith('/vgp'));
  const [collapsed, setCollapsed] = useState(false);

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved) {
      setCollapsed(JSON.parse(saved));
    }
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', JSON.stringify(newState));
  };

  // Main navigation with translations
  const navigation = [
    { name: t('navigation.dashboard'), href: '/dashboard', icon: HomeIcon },
    { name: t('navigation.assets'), href: '/assets', icon: CubeIcon },
    { name: t('navigation.audits'), href: '/audits', icon: ClipboardDocumentListIcon },
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
        "flex flex-col h-screen border-r border-gray-800 transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
      style={{ backgroundColor: colors.primary }}
    >
      {/* Logo & Toggle */}
      <div 
        className="flex items-center justify-between h-16 px-4 border-b border-gray-800"
        style={{ backgroundColor: colors.primary }}
      >
        {!collapsed && (
          <div className="flex items-center space-x-2">
            {logo ? (
              <Image 
                src={logo} 
                alt={orgName} 
                width={32} 
                height={32} 
                className="w-8 h-8 object-contain rounded"
              />
            ) : null}
            <h1 className="text-xl font-bold text-white truncate">{orgName}</h1>
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
            "p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors",
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
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
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

      {/* Language Toggle - Bottom of Sidebar */}
      {!collapsed && (
        <div className="p-4 border-t border-gray-800">
          <LanguageToggle />
        </div>
      )}
    </div>
  );
}