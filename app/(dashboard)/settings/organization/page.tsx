// app/(dashboard)/settings/organization/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  BuildingOfficeIcon,
  ArrowLeftIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '@/lib/LanguageContext';
import { useOrganization, useUpdateOrganization } from '@/hooks/useOrganization';
import { UploadButton } from '@/lib/uploadthing';
import toast from 'react-hot-toast';

export default function OrganizationSettingsPage() {
  const { language } = useLanguage();
  const { data: organization, isLoading, refetch } = useOrganization();
  const { mutateAsync: updateOrg, isPending: saving } = useUpdateOrganization();

  const [formData, setFormData] = useState({
    name: '',
    logo_url: '',
    website: '',
    phone: '',
    address: '',
    city: '',
    postal_code: '',
    country: 'FR',
    timezone: 'Europe/Paris',
    currency: 'EUR',
    industry_sector: '',
    company_size: '',
  });

  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name || '',
        logo_url: organization.logo_url || '',
        website: organization.website || '',
        phone: organization.phone || '',
        address: organization.address || '',
        city: organization.city || '',
        postal_code: organization.postal_code || '',
        country: organization.country || 'FR',
        timezone: organization.timezone || 'Europe/Paris',
        currency: organization.currency || 'EUR',
        industry_sector: organization.industry_sector || '',
        company_size: organization.company_size || '',
      });
    }
  }, [organization]);

  const labels = {
    pageTitle: { en: 'Organization Profile', fr: 'Profil de l\'Organisation' },
    pageSubtitle: { en: 'Basic information about your company', fr: 'Informations de base de votre entreprise' },
    back: { en: 'Back to Settings', fr: 'Retour aux Paramètres' },
    basicInfo: { en: 'Basic Information', fr: 'Informations de base' },
    companyName: { en: 'Company Name', fr: 'Nom de l\'entreprise' },
    logo: { en: 'Company Logo', fr: 'Logo de l\'entreprise' },
    logoHelp: { en: 'Used in reports and emails. PNG or JPG, max 2MB', fr: 'Utilisé dans les rapports et emails. PNG ou JPG, max 2Mo' },
    removeLogo: { en: 'Remove', fr: 'Supprimer' },
    website: { en: 'Website', fr: 'Site web' },
    phone: { en: 'Phone', fr: 'Téléphone' },
    addressSection: { en: 'Address', fr: 'Adresse' },
    address: { en: 'Street Address', fr: 'Adresse' },
    city: { en: 'City', fr: 'Ville' },
    postalCode: { en: 'Postal Code', fr: 'Code postal' },
    country: { en: 'Country', fr: 'Pays' },
    regionalSettings: { en: 'Regional Settings', fr: 'Paramètres régionaux' },
    timezone: { en: 'Timezone', fr: 'Fuseau horaire' },
    currency: { en: 'Currency', fr: 'Devise' },
    businessInfo: { en: 'Business Information', fr: 'Informations commerciales' },
    industrySector: { en: 'Industry Sector', fr: 'Secteur d\'activité' },
    companySize: { en: 'Company Size', fr: 'Taille de l\'entreprise' },
    save: { en: 'Save Changes', fr: 'Enregistrer' },
    saving: { en: 'Saving...', fr: 'Enregistrement...' },
    cancel: { en: 'Cancel', fr: 'Annuler' },
    saveSuccess: { en: 'Settings saved successfully', fr: 'Paramètres enregistrés avec succès' },
    saveError: { en: 'Error saving settings', fr: 'Erreur lors de l\'enregistrement' },
    logoUploadSuccess: { en: 'Logo uploaded', fr: 'Logo téléchargé' },
    logoUploadError: { en: 'Error uploading logo', fr: 'Erreur lors du téléchargement' },
    logoRemoveSuccess: { en: 'Logo removed', fr: 'Logo supprimé' },
    select: { en: 'Select...', fr: 'Sélectionner...' },
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

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRemoveLogo = async () => {
    try {
      await updateOrg({ logo_url: null });
      setFormData(prev => ({ ...prev, logo_url: '' }));
      toast.success(labels.logoRemoveSuccess[language]);
    } catch (error: any) {
      toast.error(error.message || labels.saveError[language]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateOrg(formData);
      toast.success(labels.saveSuccess[language]);
    } catch (error: any) {
      toast.error(error.message || labels.saveError[language]);
    }
  };

  if (isLoading) {
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
        <Link
          href="/settings"
          className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          {labels.back[language]}
        </Link>

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

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-900 mb-4">
              {labels.basicInfo[language]}
            </h3>
            
            <div className="space-y-4">
              {/* Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {labels.logo[language]}
                </label>
                <p className="text-xs text-gray-500 mb-3">{labels.logoHelp[language]}</p>
                
                <div className="flex items-center space-x-4">
                  {/* Logo Preview */}
                  {formData.logo_url ? (
                    <div className="relative">
                      <Image
                        src={formData.logo_url}
                        alt="Company logo"
                        width={80}
                        height={80}
                        className="w-20 h-20 object-contain border border-gray-200 rounded-lg bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="absolute -top-2 -right-2 p-1 bg-red-100 rounded-full text-red-600 hover:bg-red-200"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                      <BuildingOfficeIcon className="w-8 h-8 text-gray-400" />
                    </div>
                  )}

                  {/* Upload Button */}
                  <UploadButton
                    endpoint="organizationLogo"
                    onClientUploadComplete={(res) => {
                      if (res?.[0]?.url) {
                        setFormData(prev => ({ ...prev, logo_url: res[0].url }));
                        refetch();
                        toast.success(labels.logoUploadSuccess[language]);
                      }
                    }}
                    onUploadError={(error: Error) => {
                      toast.error(labels.logoUploadError[language]);
                      console.error('Upload error:', error);
                    }}
                    appearance={{
                      button: "bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium px-4 py-2 rounded-lg",
                      allowedContent: "hidden",
                    }}
                  />
                </div>
              </div>

              {/* Company Name */}
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
                />
              </div>

              {/* Website */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {labels.website[language]}
                </label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleChange('website', e.target.value)}
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
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="+33 1 23 45 67 89"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-900 mb-4">
              {labels.addressSection[language]}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {labels.address[language]}
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.city[language]}
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.postalCode[language]}
                  </label>
                  <input
                    type="text"
                    value={formData.postal_code}
                    onChange={(e) => handleChange('postal_code', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

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
              {labels.regionalSettings[language]}
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
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

          {/* Business Info */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-900 mb-4">
              {labels.businessInfo[language]}
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {labels.industrySector[language]}
                </label>
                <select
                  value={formData.industry_sector}
                  onChange={(e) => handleChange('industry_sector', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">{labels.select[language]}</option>
                  {industrySectors.map(s => (
                    <option key={s.value} value={s.value}>{s.label[language]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {labels.companySize[language]}
                </label>
                <select
                  value={formData.company_size}
                  onChange={(e) => handleChange('company_size', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">{labels.select[language]}</option>
                  {companySizes.map(s => (
                    <option key={s.value} value={s.value}>{s.label[language]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-4">
            <Link
              href="/settings"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {labels.cancel[language]}
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? labels.saving[language] : labels.save[language]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}