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
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { AlertCircle, Calendar, FileText, History } from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Assets', href: '/assets', icon: CubeIcon },
  { name: 'Audits', href: '/audits', icon: ClipboardDocumentListIcon },
  { name: 'Team', href: '/team', icon: UsersIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

const vgpNavigation = [
  { name: "Vue d'ensemble", href: '/vgp', icon: AlertCircle },
  { name: 'Suivi', href: '/vgp/schedules', icon: Calendar },
  { name: 'Rapport DIRECCTE', href: '/vgp/report', icon: FileText },
  { name: 'Historique', href: '/vgp/inspections', icon: History },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [vgpOpen, setVgpOpen] = useState(pathname.startsWith('/vgp'));

  return (
    <div className="flex flex-col w-64 bg-gray-900">
      <div className="flex items-center h-16 px-4 bg-gray-900 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">TraviXO</h1>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
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
              VGP Compliance
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

        {/* Audits, Team, Settings */}
        {navigation.slice(2).map((item) => {
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
      </nav>
    </div>
  );
}