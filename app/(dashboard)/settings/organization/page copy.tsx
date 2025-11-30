// app/(dashboard)/settings/organization/page.tsx
// Organization Settings - Uses project's custom i18n system
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    BuildingOfficeIcon,
    ArrowLeftIcon,
    PhotoIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '@/lib/LanguageContext';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface OrganizationData {
    name: string;
    logo_url: string | null;
    website: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    country: string;
    timezone: string;
    currency: string;
    industry_sector: string | null;
    company_size: string | null;
}

export default function OrganizationSettingsPage() {
    const { language } = useLanguage();
    const router = useRouter();
    const supabase = createClientComponentClient();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [formData, setFormData] = useState<OrganizationData>({
        name: '',
        logo_url: null,
        website: null,
        phone: null,
        address: null,
        city: null,
        postal_code: null,
        country: 'FR',
        timezone: 'Europe/Paris',
        currency: 'EUR',
        industry_sector: null,
        company_size: null,
    });

    // Labels
    const labels = {
        pageTitle: {
            en: 'Organization Profile',
            fr: 'Profil de l\'Organisation',
        },
        pageSubtitle: {
            en: 'Basic information about your company',
            fr: 'Informations de base de votre entreprise',
        },
        companyName: {
            en: 'Company Name',
            fr: 'Nom de l\'entreprise',
        },
        logo: {
            en: 'Company Logo',
            fr: 'Logo de l\'entreprise',
        },
        logoHelp: {
            en: 'Used in reports and emails. PNG or JPG, max 2MB',
            fr: 'Utilisé dans les rapports et emails. PNG ou JPG, max 2Mo',
        },
        uploadLogo: {
            en: 'Upload Logo',
            fr: 'Télécharger un logo',
        },
        removeLogo: {
            en: 'Remove',
            fr: 'Supprimer',
        },
        website: {
            en: 'Website',
            fr: 'Site web',
        },
        phone: {
            en: 'Phone',
            fr: 'Téléphone',
        },
        address: {
            en: 'Address',
            fr: 'Adresse',
        },
        city: {
            en: 'City',
            fr: 'Ville',
        },
        postalCode: {
            en: 'Postal Code',
            fr: 'Code postal',
        },
        country: {
            en: 'Country',
            fr: 'Pays',
        },
        timezone: {
            en: 'Timezone',
            fr: 'Fuseau horaire',
        },
        currency: {
            en: 'Currency',
            fr: 'Devise',
        },
        industrySector: {
            en: 'Industry Sector',
            fr: 'Secteur d\'activité',
        },
        companySize: {
            en: 'Company Size',
            fr: 'Taille de l\'entreprise',
        },
        save: {
            en: 'Save Changes',
            fr: 'Enregistrer les modifications',
        },
        saving: {
            en: 'Saving...',
            fr: 'Enregistrement...',
        },
        cancel: {
            en: 'Cancel',
            fr: 'Annuler',
        },
        back: {
            en: 'Back to Settings',
            fr: 'Retour aux Paramètres',
        },
        saveSuccess: {
            en: 'Organization settings saved successfully',
            fr: 'Paramètres de l\'organisation enregistrés avec succès',
        },
        saveError: {
            en: 'Error saving settings',
            fr: 'Erreur lors de l\'enregistrement des paramètres',
        },
        loadError: {
            en: 'Error loading organization data',
            fr: 'Erreur lors du chargement des données',
        },
    };

    const countries = [
        { value: 'FR', label: { en: 'France', fr: 'France' } },
        { value: 'BE', label: { en: 'Belgium', fr: 'Belgique' } },
        { value: 'CH', label: { en: 'Switzerland', fr: 'Suisse' } },
        { value: 'LU', label: { en: 'Luxembourg', fr: 'Luxembourg' } },
    ];

    const timezones = [
        { value: 'Europe/Paris', label: 'Europe/Paris (GMT+1)' },
        { value: 'Europe/Brussels', label: 'Europe/Brussels (GMT+1)' },
        { value: 'Europe/Zurich', label: 'Europe/Zurich (GMT+1)' },
    ];

    const currencies = [
        { value: 'EUR', label: { en: 'Euro (€)', fr: 'Euro (€)' } },
        { value: 'USD', label: { en: 'US Dollar ($)', fr: 'Dollar US ($)' } },
        { value: 'GBP', label: { en: 'Pound Sterling (£)', fr: 'Livre Sterling (£)' } },
    ];

    const industrySectors = [
        { value: 'construction', label: { en: 'Construction', fr: 'Construction' } },
        { value: 'rental', label: { en: 'Equipment Rental', fr: 'Location d\'équipements' } },
        { value: 'logistics', label: { en: 'Logistics', fr: 'Logistique' } },
        { value: 'manufacturing', label: { en: 'Manufacturing', fr: 'Fabrication' } },
        { value: 'other', label: { en: 'Other', fr: 'Autre' } },
    ];

    const companySizes = [
        { value: 'small', label: { en: '1-10 employees', fr: '1-10 employés' } },
        { value: 'medium', label: { en: '11-50 employees', fr: '11-50 employés' } },
        { value: 'large', label: { en: '51-200 employees', fr: '51-200 employés' } },
        { value: 'enterprise', label: { en: '200+ employees', fr: '200+ employés' } },
    ];

    // Load organization data
    useEffect(() => {
        async function loadOrganization() {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    router.push('/login');
                    return;
                }
                const user = session.user;

                // Get user's organization
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('organization_id')
                    .eq('id', user.id)
                    .single();

                if (userError || !userData?.organization_id) {
                    setError(labels.loadError[language]);
                    setLoading(false);
                    return;
                }

                // Get organization data
                const { data: orgData, error: orgError } = await supabase
                    .from('organizations')
                    .select('*')
                    .eq('id', userData.organization_id)
                    .single();

                if (orgError) {
                    setError(labels.loadError[language]);
                    setLoading(false);
                    return;
                }

                setFormData({
                    name: orgData.name || '',
                    logo_url: orgData.logo_url || null,
                    website: orgData.website || null,
                    phone: orgData.phone || null,
                    address: orgData.address || null,
                    city: orgData.city || null,
                    postal_code: orgData.postal_code || null,
                    country: orgData.country || 'FR',
                    timezone: orgData.timezone || 'Europe/Paris',
                    currency: orgData.currency || 'EUR',
                    industry_sector: orgData.industry_sector || null,
                    company_size: orgData.company_size || null,
                });

                setLoading(false);
            } catch (err) {
                console.error('Error loading organization:', err);
                setError(labels.loadError[language]);
                setLoading(false);
            }
        }

        loadOrganization();
    }, []);

    // Handle form submission
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }

            // Get user's organization
            const { data: userData } = await supabase
                .from('users')
                .select('organization_id')
                .eq('id', user.id)
                .single();

            if (!userData?.organization_id) {
                setError(labels.saveError[language]);
                setSaving(false);
                return;
            }

            // Update organization
            const { error: updateError } = await supabase
                .from('organizations')
                .update({
                    name: formData.name,
                    logo_url: formData.logo_url,
                    website: formData.website,
                    phone: formData.phone,
                    address: formData.address,
                    city: formData.city,
                    postal_code: formData.postal_code,
                    country: formData.country,
                    timezone: formData.timezone,
                    currency: formData.currency,
                    industry_sector: formData.industry_sector,
                    company_size: formData.company_size,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', userData.organization_id);

            if (updateError) {
                console.error('Update error:', updateError);
                setError(labels.saveError[language]);
                setSaving(false);
                return;
            }

            setSuccess(labels.saveSuccess[language]);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            console.error('Error saving:', err);
            setError(labels.saveError[language]);
        } finally {
            setSaving(false);
        }
    }

    // Handle input changes
    function handleChange(field: keyof OrganizationData, value: string | null) {
        setFormData(prev => ({ ...prev, [field]: value }));
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Back Button */}
                <button
                    onClick={() => router.push('/settings')}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
                >
                    <ArrowLeftIcon className="w-4 h-4 mr-2" />
                    {labels.back[language]}
                </button>

                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <BuildingOfficeIcon className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900">
                                {labels.pageTitle[language]}
                            </h1>
                            <p className="text-sm text-gray-600">
                                {labels.pageSubtitle[language]}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Success/Error Messages */}
                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-800">{success}</p>
                    </div>
                )}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800">{error}</p>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Company Name */}
                    <div className="bg-white shadow rounded-lg p-6">
                        <h3 className="text-sm font-medium text-gray-900 mb-4">
                            {language === 'fr' ? 'Informations de base' : 'Basic Information'}
                        </h3>

                        <div className="space-y-4">
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {labels.companyName[language]} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => handleChange('name', e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="TraviXO Systems"
                                />
                            </div>

                            {/* Logo */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {labels.logo[language]}
                                </label>
                                <p className="text-xs text-gray-500 mb-2">{labels.logoHelp[language]}</p>

                                {formData.logo_url ? (
                                    <div className="flex items-center space-x-4">
                                        <img
                                            src={formData.logo_url}
                                            alt="Company logo"
                                            className="w-16 h-16 object-contain border border-gray-200 rounded-lg"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleChange('logo_url', null)}
                                            className="text-sm text-red-600 hover:text-red-500 flex items-center"
                                        >
                                            <XMarkIcon className="w-4 h-4 mr-1" />
                                            {labels.removeLogo[language]}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center w-full">
                                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                <PhotoIcon className="w-8 h-8 text-gray-400 mb-2" />
                                                <p className="text-sm text-gray-500">{labels.uploadLogo[language]}</p>
                                            </div>
                                            <input type="file" className="hidden" accept="image/png,image/jpeg" />
                                        </label>
                                    </div>
                                )}
                            </div>

                            {/* Website */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {labels.website[language]}
                                </label>
                                <input
                                    type="url"
                                    value={formData.website || ''}
                                    onChange={(e) => handleChange('website', e.target.value || null)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="https://www.example.com"
                                />
                            </div>

                            {/* Phone */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {labels.phone[language]}
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone || ''}
                                    onChange={(e) => handleChange('phone', e.target.value || null)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="+33 1 23 45 67 89"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Address Section */}
                    <div className="bg-white shadow rounded-lg p-6">
                        <h3 className="text-sm font-medium text-gray-900 mb-4">
                            {language === 'fr' ? 'Adresse' : 'Address'}
                        </h3>

                        <div className="space-y-4">
                            {/* Street Address */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {labels.address[language]}
                                </label>
                                <input
                                    type="text"
                                    value={formData.address || ''}
                                    onChange={(e) => handleChange('address', e.target.value || null)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder={language === 'fr' ? '123 Rue de la République' : '123 Main Street'}
                                />
                            </div>

                            {/* City and Postal Code */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {labels.city[language]}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.city || ''}
                                        onChange={(e) => handleChange('city', e.target.value || null)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="Paris"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {labels.postalCode[language]}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.postal_code || ''}
                                        onChange={(e) => handleChange('postal_code', e.target.value || null)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="75001"
                                    />
                                </div>
                            </div>

                            {/* Country */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {labels.country[language]}
                                </label>
                                <select
                                    value={formData.country}
                                    onChange={(e) => handleChange('country', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    {countries.map(c => (
                                        <option key={c.value} value={c.value}>{c.label[language]}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Regional Settings */}
                    <div className="bg-white shadow rounded-lg p-6">
                        <h3 className="text-sm font-medium text-gray-900 mb-4">
                            {language === 'fr' ? 'Paramètres régionaux' : 'Regional Settings'}
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Timezone */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {labels.timezone[language]}
                                </label>
                                <select
                                    value={formData.timezone}
                                    onChange={(e) => handleChange('timezone', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    {timezones.map(tz => (
                                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Currency */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {labels.currency[language]}
                                </label>
                                <select
                                    value={formData.currency}
                                    onChange={(e) => handleChange('currency', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    {currencies.map(c => (
                                        <option key={c.value} value={c.value}>{c.label[language]}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Business Information */}
                    <div className="bg-white shadow rounded-lg p-6">
                        <h3 className="text-sm font-medium text-gray-900 mb-4">
                            {language === 'fr' ? 'Informations commerciales' : 'Business Information'}
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Industry Sector */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {labels.industrySector[language]}
                                </label>
                                <select
                                    value={formData.industry_sector || ''}
                                    onChange={(e) => handleChange('industry_sector', e.target.value || null)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="">{language === 'fr' ? 'Sélectionner...' : 'Select...'}</option>
                                    {industrySectors.map(s => (
                                        <option key={s.value} value={s.value}>{s.label[language]}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Company Size */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {labels.companySize[language]}
                                </label>
                                <select
                                    value={formData.company_size || ''}
                                    onChange={(e) => handleChange('company_size', e.target.value || null)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="">{language === 'fr' ? 'Sélectionner...' : 'Select...'}</option>
                                    {companySizes.map(s => (
                                        <option key={s.value} value={s.value}>{s.label[language]}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end space-x-4">
                        <button
                            type="button"
                            onClick={() => router.push('/settings')}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            {labels.cancel[language]}
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? labels.saving[language] : labels.save[language]}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}