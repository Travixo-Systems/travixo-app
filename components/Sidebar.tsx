// components/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  HomeIcon,
  CubeIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  Cog6ToothIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CreditCardIcon
} from '@heroicons/react/24/outline';
import { AlertCircle, Calendar, FileText, History } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';
import { LanguageToggle } from './LanguageToggle';

export default function Sidebar() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const t = createTranslator(language);
  const [vgpOpen, setVgpOpen] = useState(pathname.startsWith('/vgp'));

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
    <div className="flex flex-col w-64 bg-gray-900 h-screen">
      {/* Logo */}
      <div className="flex items-center h-16 px-4 bg-gray-900 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">TraviXO</h1>
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
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          );
        })}

        {/* VGP Dropdown Section - After Assets, Before Audits */}
        <div>
          <button
            onClick={() => setVgpOpen(!vgpOpen)}
            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              pathname.startsWith('/vgp')
                ? 'bg-gray-800 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 mr-3" />
              {t('navigation.vgp')}
            </div>
            {vgpOpen ? (
              <ChevronDownIcon className="w-4 h-4" />
            ) : (
              <ChevronRightIcon className="w-4 h-4" />
            )}
          </button>

          {/* VGP Sub-menu */}
          {vgpOpen && (
            <div className="mt-1 ml-4 space-y-1">
              {vgpNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center px-4 py-2 text-sm rounded-lg transition-colors ${
                      isActive
                        ? 'bg-gray-800 text-white font-medium'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
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
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Language Toggle - Bottom of Sidebar */}
      <div className="p-4 border-t border-gray-800">
        <LanguageToggle />
      </div>
    </div>
  );
}