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
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
            {labels.pageTitle[language]}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted, #777)' }}>
            {labels.pageSubtitle[language]}
          </p>
        </div>

        {/* Settings Links */}
        <div className="rounded-lg divide-y" style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderColor: '#dcdee3' }}>
          {settingsLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between p-6 hover:bg-black/[0.02] transition-colors"
                style={{ borderColor: '#dcdee3' }}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--page-bg, #f6f8fd)' }}>
                    <Icon className="w-5 h-5" style={{ color: 'var(--accent, #e8600a)' }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {link.label}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted, #777)' }}>
                      {link.description}
                    </p>
                  </div>
                </div>
                <ChevronRightIcon className="w-5 h-5" style={{ color: 'var(--text-hint, #888)' }} />
              </Link>
            );
          })}
        </div>

        {/* Help Section */}
        <div className="mt-8 rounded-lg p-6" style={{ backgroundColor: 'var(--card-bg, #edeff2)', border: '0.5px solid #dcdee3' }}>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
            {language === 'fr' ? 'Besoin d\'aide ?' : 'Need Help?'}
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted, #777)' }}>
            {language === 'fr'
              ? 'Notre équipe support est disponible pour vous aider avec la configuration.'
              : 'Our support team is available to help you with configuration.'
            }
          </p>
          <a
            href="mailto:info@travixosystems.com"
            className="text-sm font-medium" style={{ color: 'var(--accent, #e8600a)' }}
          >
            info@travixosystems.com
          </a>
        </div>
      </div>
    </div>
    );
}