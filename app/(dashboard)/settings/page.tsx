// app/(dashboard)/settings/page.tsx
'use client';

import Link from 'next/link';
import {
  UserCircleIcon,
  BuildingOfficeIcon,
  PaintBrushIcon,
  BellIcon,
  CreditCardIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '@/lib/LanguageContext';

export default function SettingsPage() {
  const { language } = useLanguage();

  const labels = {
    pageTitle: { en: 'Settings', fr: 'Paramètres' },
    pageSubtitle: { en: 'Manage your account and preferences', fr: 'Gérez votre compte et préférences' },
    
    profile: { en: 'Profile', fr: 'Profil' },
    profileDesc: { en: 'Manage your personal information', fr: 'Gérez vos informations personnelles' },
    
    organization: { en: 'Organization', fr: 'Organisation' },
    organizationDesc: { en: 'Company details and branding', fr: 'Détails et image de marque' },
    
    theme: { en: 'Theme', fr: 'Thème' },
    themeDesc: { en: 'Customize colors and appearance', fr: 'Personnalisez les couleurs' },
    
    notifications: { en: 'Notifications', fr: 'Notifications' },
    notificationsDesc: { en: 'Email alerts and preferences', fr: 'Alertes email et préférences' },
    
    subscription: { en: 'Subscription', fr: 'Abonnement' },
    subscriptionDesc: { en: 'Plan, billing, and usage', fr: 'Plan, facturation et utilisation' },
  };

  const settingsLinks = [
    {
      href: '/settings/profile',
      icon: UserCircleIcon,
      label: labels.profile[language],
      description: labels.profileDesc[language],
    },
    {
      href: '/settings/organization',
      icon: BuildingOfficeIcon,
      label: labels.organization[language],
      description: labels.organizationDesc[language],
    },
    {
      href: '/settings/theme',
      icon: PaintBrushIcon,
      label: labels.theme[language],
      description: labels.themeDesc[language],
    },
    {
      href: '/settings/notifications',
      icon: BellIcon,
      label: labels.notifications[language],
      description: labels.notificationsDesc[language],
    },
    {
      href: '/settings/subscription',
      icon: CreditCardIcon,
      label: labels.subscription[language],
      description: labels.subscriptionDesc[language],
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            {labels.pageTitle[language]}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {labels.pageSubtitle[language]}
          </p>
        </div>

        {/* Settings Links */}
        <div className="bg-white shadow rounded-lg divide-y divide-gray-200">
          {settingsLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">
                      {link.label}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {link.description}
                    </p>
                  </div>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-400" />
              </Link>
            );
          })}
        </div>

                {/* Help Section */}
                <div className="mt-8 bg-white shadow rounded-lg p-6">
                    <h3 className="text-sm font-medium text-gray-900 mb-2">
                        {language === 'fr' ? 'Besoin d\'aide ?' : 'Need Help?'}
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                        {language === 'fr'
                            ? 'Notre équipe support est disponible pour vous aider avec la configuration.'
                            : 'Our support team is available to help you with configuration.'
                        }
                    </p>
                    <a
                        href="mailto:info@travixosystems.com"
                        className="text-sm font-medium text-blue-600 hover:text-blue-500"
                    >
                        support@travixosystems.com
                    </a>
                </div>
            </div>
        </div>
    );
}