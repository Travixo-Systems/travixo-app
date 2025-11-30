// app/(dashboard)/settings/page.tsx
// Settings Hub - Uses project's custom i18n system
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    BuildingOfficeIcon,
    PaintBrushIcon,
    BellIcon,
    CreditCardIcon,
    ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '@/lib/LanguageContext';
import { getTranslation } from '@/lib/i18n';

export default function SettingsPage() {
    const { language } = useLanguage();
    const t = (key: string) => getTranslation(key, language);

    const settingsSections = [
        {
            id: 'organization',
            href: '/settings/organization',
            icon: BuildingOfficeIcon,
            title: {
                en: 'Organization',
                fr: 'Organisation',
            },
            description: {
                en: 'Company name, logo, contact information',
                fr: 'Nom de l\'entreprise, logo, coordonnées',
            },
        },
        {
            id: 'branding',
            href: '/settings/branding',
            icon: PaintBrushIcon,
            title: { en: 'Theme', fr: 'Thème' },
            description: {
                en: 'Customize colors and visual identity',
                fr: 'Personnalisez les couleurs et l\'identité visuelle',
            },
        },
        {
            id: 'notifications',
            href: '/settings/notifications',
            icon: BellIcon,
            title: {
                en: 'Notifications',
                fr: 'Notifications',
            },
            description: {
                en: 'Email alerts, VGP reminders, digest settings',
                fr: 'Alertes email, rappels VGP, paramètres de résumé',
            },
        },
        {
            id: 'subscription',
            href: '/settings/subscription',
            icon: CreditCardIcon,
            title: {
                en: 'Subscription',
                fr: 'Abonnement',
            },
            description: {
                en: 'Plans, billing, and usage',
                fr: 'Plans, facturation et utilisation',
            },
        },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-semibold text-gray-900">
                        {language === 'fr' ? 'Paramètres' : 'Settings'}
                    </h1>
                    <p className="mt-1 text-sm text-gray-600">
                        {language === 'fr'
                            ? 'Gérez les paramètres de votre organisation'
                            : 'Manage your organization settings'
                        }
                    </p>
                </div>

                {/* Settings Sections Grid */}
                <div className="bg-white shadow rounded-lg divide-y divide-gray-200">
                    {settingsSections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <Link
                                key={section.id}
                                href={section.href}
                                className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
                            >
                                <div className="flex items-center space-x-4">
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                            <Icon className="w-5 h-5 text-gray-600" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-gray-900">
                                            {section.title[language]}
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            {section.description[language]}
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
                        href="mailto:support@travixosystems.com"
                        className="text-sm font-medium text-blue-600 hover:text-blue-500"
                    >
                        support@travixosystems.com
                    </a>
                </div>
            </div>
        </div>
    );
}