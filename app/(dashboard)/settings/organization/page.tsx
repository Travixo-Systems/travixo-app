// app/(dashboard)/settings/organization/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  BuildingOfficeIcon,
  ArrowLeftIcon,
  XMarkIcon,
  PencilIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '@/lib/LanguageContext';
import { useOrganization, useUpdateOrganization } from '@/hooks/useOrganization';
import { UploadButton } from '@/lib/uploadthing';
import toast from 'react-hot-toast';

export default function OrganizationSettingsPage() {
  const { language } = useLanguage();
  const { data: organization, isLoading, refetch } = useOrganization();
  const { mutateAsync: updateOrganization, isPending: saving } = useUpdateOrganization();

  const [isEditing, setIsEditing] = useState(false);

  const [orgData, setOrgData] = useState({
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
      setOrgData({
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
    pageTitle: { en: 'Organization', fr: 'Organisation' },
    pageSubtitle: { en: 'Manage company details and branding', fr: 'Gérez les détails et l\'image de marque' },
    back: { en: 'Back to Settings', fr: 'Retour aux Paramètres' },
    edit: { en: 'Edit', fr: 'Modifier' },
    save: { en: 'Save Changes', fr: 'Enregistrer' },
    cancel: { en: 'Cancel', fr: 'Annuler' },
    saving: { en: 'Saving...', fr: 'Enregistrement...' },
    saveSuccess: { en: 'Organization updated successfully', fr: 'Organisation mise à jour avec succès' },
    saveError: { en: 'Error updating organization', fr: 'Erreur lors de la mise à jour' },
    
    companyInfo: { en: 'Company Information', fr: 'Informations de l\'Entreprise' },
    companyName: { en: 'Company Name', fr: 'Nom de l\'Entreprise' },
    logo: { en: 'Logo', fr: 'Logo' },
    logoHelp: { en: 'JPG or PNG, max 2MB', fr: 'JPG ou PNG, max 2Mo' },
    uploadLogo: { en: 'Upload Logo', fr: 'Télécharger le logo' },
    removeLogo: { en: 'Remove', fr: 'Supprimer' },
    website: { en: 'Website', fr: 'Site Web' },
    phone: { en: 'Phone', fr: 'Téléphone' },
    
    location: { en: 'Location', fr: 'Localisation' },
    address: { en: 'Address', fr: 'Adresse' },
    city: { en: 'City', fr: 'Ville' },
    postalCode: { en: 'Postal Code', fr: 'Code Postal' },
    country: { en: 'Country', fr: 'Pays' },
    
    regional: { en: 'Regional Settings', fr: 'Paramètres Régionaux' },
    timezone: { en: 'Time Zone', fr: 'Fuseau Horaire' },
    currency: { en: 'Currency', fr: 'Devise' },
    
    additional: { en: 'Additional Information', fr: 'Informations Complémentaires' },
    industrySector: { en: 'Industry Sector', fr: 'Secteur d\'Activité' },
    companySize: { en: 'Company Size', fr: 'Taille de l\'Entreprise' },
    
    notSet: { en: 'Not set', fr: 'Non défini' },
    logoUploadSuccess: { en: 'Logo uploaded', fr: 'Logo téléchargé' },
    logoUploadError: { en: 'Error uploading logo', fr: 'Erreur lors du téléchargement' },
    logoRemoveSuccess: { en: 'Logo removed', fr: 'Logo supprimé' },
    
    // Country options
    france: { en: 'France', fr: 'France' },
    belgium: { en: 'Belgium', fr: 'Belgique' },
    switzerland: { en: 'Switzerland', fr: 'Suisse' },
    luxembourg: { en: 'Luxembourg', fr: 'Luxembourg' },
    
    // Industry sectors
    constructionEquipment: { en: 'Construction Equipment', fr: 'Matériel de Construction' },
    industrialEquipment: { en: 'Industrial Equipment', fr: 'Équipement Industriel' },
    logistics: { en: 'Logistics & Transport', fr: 'Logistique & Transport' },
    events: { en: 'Events & Services', fr: 'Événementiel & Services' },
    other: { en: 'Other', fr: 'Autre' },
    
    // Company sizes
    size_1_10: { en: '1-10 employees', fr: '1-10 employés' },
    size_11_50: { en: '11-50 employees', fr: '11-50 employés' },
    size_51_200: { en: '51-200 employees', fr: '51-200 employés' },
    size_201_500: { en: '201-500 employees', fr: '201-500 employés' },
    size_500_plus: { en: '500+ employees', fr: '500+ employés' },
  };

  const handleChange = (field: string, value: string) => {
    setOrgData(prev => ({ ...prev, [field]: value }));
  };

  const handleRemoveLogo = async () => {
    try {
      await updateOrganization({ logo_url: null });
      setOrgData(prev => ({ ...prev, logo_url: '' }));
      toast.success(labels.logoRemoveSuccess[language]);
    } catch (error: any) {
      toast.error(error.message || labels.saveError[language]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateOrganization(orgData);
      toast.success(labels.saveSuccess[language]);
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error.message || labels.saveError[language]);
    }
  };

  const handleCancelEdit = () => {
    if (organization) {
      setOrgData({
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
    setIsEditing(false);
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
        <div className="mb-8 flex items-center justify-between">
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

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <PencilIcon className="w-4 h-4" />
              <span>{labels.edit[language]}</span>
            </button>
          )}
        </div>

        {/* VIEW MODE */}
        {!isEditing && (
          <div className="space-y-6">
            {/* Company Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.companyInfo[language]}
              </h3>

              <div className="space-y-4">
                {/* Logo */}
                <div className="flex items-center pb-4 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700 w-32">
                    {labels.logo[language]}
                  </div>
                  <div>
                    {orgData.logo_url ? (
                      <Image
                        src={orgData.logo_url}
                        alt="Logo"
                        width={80}
                        height={80}
                        className="h-20 w-auto object-contain"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center">
                        <BuildingOfficeIcon className="w-10 h-10 text-gray-400" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Company Name */}
                <div className="flex items-center py-3 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700 w-32">
                    {labels.companyName[language]}
                  </div>
                  <div className="text-sm text-gray-900">
                    {orgData.name || <span className="text-gray-400">{labels.notSet[language]}</span>}
                  </div>
                </div>

                {/* Website */}
                <div className="flex items-center py-3 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700 w-32">
                    {labels.website[language]}
                  </div>
                  <div className="text-sm text-gray-900">
                    {orgData.website ? (
                      <a href={orgData.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {orgData.website}
                      </a>
                    ) : (
                      <span className="text-gray-400">{labels.notSet[language]}</span>
                    )}
                  </div>
                </div>

                {/* Phone */}
                <div className="flex items-center py-3">
                  <div className="text-sm font-medium text-gray-700 w-32">
                    {labels.phone[language]}
                  </div>
                  <div className="text-sm text-gray-900">
                    {orgData.phone || <span className="text-gray-400">{labels.notSet[language]}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.location[language]}
              </h3>

              <div className="space-y-4">
                <div className="flex items-center py-3 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700 w-32">{labels.address[language]}</div>
                  <div className="text-sm text-gray-900">{orgData.address || <span className="text-gray-400">{labels.notSet[language]}</span>}</div>
                </div>

                <div className="flex items-center py-3 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700 w-32">{labels.city[language]}</div>
                  <div className="text-sm text-gray-900">{orgData.city || <span className="text-gray-400">{labels.notSet[language]}</span>}</div>
                </div>

                <div className="flex items-center py-3 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700 w-32">{labels.postalCode[language]}</div>
                  <div className="text-sm text-gray-900">{orgData.postal_code || <span className="text-gray-400">{labels.notSet[language]}</span>}</div>
                </div>

                <div className="flex items-center py-3">
                  <div className="text-sm font-medium text-gray-700 w-32">{labels.country[language]}</div>
                  <div className="text-sm text-gray-900">
                    {orgData.country === 'FR' && labels.france[language]}
                    {orgData.country === 'BE' && labels.belgium[language]}
                    {orgData.country === 'CH' && labels.switzerland[language]}
                    {orgData.country === 'LU' && labels.luxembourg[language]}
                  </div>
                </div>
              </div>
            </div>

            {/* Regional Settings */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.regional[language]}
              </h3>

              <div className="space-y-4">
                <div className="flex items-center py-3 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700 w-32">{labels.timezone[language]}</div>
                  <div className="text-sm text-gray-900">{orgData.timezone}</div>
                </div>

                <div className="flex items-center py-3">
                  <div className="text-sm font-medium text-gray-700 w-32">{labels.currency[language]}</div>
                  <div className="text-sm text-gray-900">{orgData.currency}</div>
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.additional[language]}
              </h3>

              <div className="space-y-4">
                <div className="flex items-center py-3 border-b border-gray-200">
                  <div className="text-sm font-medium text-gray-700 w-32">{labels.industrySector[language]}</div>
                  <div className="text-sm text-gray-900">
                    {orgData.industry_sector === 'construction_equipment' && labels.constructionEquipment[language]}
                    {orgData.industry_sector === 'industrial_equipment' && labels.industrialEquipment[language]}
                    {orgData.industry_sector === 'logistics' && labels.logistics[language]}
                    {orgData.industry_sector === 'events' && labels.events[language]}
                    {orgData.industry_sector === 'other' && labels.other[language]}
                    {!orgData.industry_sector && <span className="text-gray-400">{labels.notSet[language]}</span>}
                  </div>
                </div>

                <div className="flex items-center py-3">
                  <div className="text-sm font-medium text-gray-700 w-32">{labels.companySize[language]}</div>
                  <div className="text-sm text-gray-900">
                    {orgData.company_size === '1-10' && labels.size_1_10[language]}
                    {orgData.company_size === '11-50' && labels.size_11_50[language]}
                    {orgData.company_size === '51-200' && labels.size_51_200[language]}
                    {orgData.company_size === '201-500' && labels.size_201_500[language]}
                    {orgData.company_size === '500+' && labels.size_500_plus[language]}
                    {!orgData.company_size && <span className="text-gray-400">{labels.notSet[language]}</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EDIT MODE */}
        {isEditing && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Company Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.companyInfo[language]}
              </h3>

              <div className="space-y-4">
                {/* Logo Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.logo[language]}
                  </label>
                  <p className="text-xs text-gray-500 mb-3">{labels.logoHelp[language]}</p>
                  
                  <div className="flex items-center space-x-4">
                    {orgData.logo_url ? (
                      <div className="relative">
                        <Image
                          src={orgData.logo_url}
                          alt="Logo"
                          width={80}
                          height={80}
                          className="h-20 w-auto object-contain"
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
                      <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center">
                        <BuildingOfficeIcon className="w-10 h-10 text-gray-400" />
                      </div>
                    )}

                    <UploadButton
                      endpoint="organizationLogo"
                      onClientUploadComplete={(res) => {
                        if (res?.[0]?.url) {
                          setOrgData(prev => ({ ...prev, logo_url: res[0].url }));
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
                    {labels.companyName[language]}
                  </label>
                  <input
                    type="text"
                    value={orgData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Website */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.website[language]}
                  </label>
                  <input
                    type="url"
                    value={orgData.website}
                    onChange={(e) => handleChange('website', e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {labels.phone[language]}
                  </label>
                  <input
                    type="tel"
                    value={orgData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    placeholder="+33 1 23 45 67 89"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.location[language]}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{labels.address[language]}</label>
                  <input
                    type="text"
                    value={orgData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{labels.city[language]}</label>
                    <input
                      type="text"
                      value={orgData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{labels.postalCode[language]}</label>
                    <input
                      type="text"
                      value={orgData.postal_code}
                      onChange={(e) => handleChange('postal_code', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{labels.country[language]}</label>
                  <select
                    value={orgData.country}
                    onChange={(e) => handleChange('country', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="FR">{labels.france[language]}</option>
                    <option value="BE">{labels.belgium[language]}</option>
                    <option value="CH">{labels.switzerland[language]}</option>
                    <option value="LU">{labels.luxembourg[language]}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Regional Settings */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.regional[language]}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{labels.timezone[language]}</label>
                  <select
                    value={orgData.timezone}
                    onChange={(e) => handleChange('timezone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Europe/Paris">Europe/Paris (UTC+1/+2)</option>
                    <option value="Europe/Brussels">Europe/Brussels (UTC+1/+2)</option>
                    <option value="Europe/Zurich">Europe/Zurich (UTC+1/+2)</option>
                    <option value="Europe/Luxembourg">Europe/Luxembourg (UTC+1/+2)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{labels.currency[language]}</label>
                  <select
                    value={orgData.currency}
                    onChange={(e) => handleChange('currency', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="CHF">CHF (CHF)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.additional[language]}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{labels.industrySector[language]}</label>
                  <select
                    value={orgData.industry_sector}
                    onChange={(e) => handleChange('industry_sector', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">{labels.notSet[language]}</option>
                    <option value="construction_equipment">{labels.constructionEquipment[language]}</option>
                    <option value="industrial_equipment">{labels.industrialEquipment[language]}</option>
                    <option value="logistics">{labels.logistics[language]}</option>
                    <option value="events">{labels.events[language]}</option>
                    <option value="other">{labels.other[language]}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{labels.companySize[language]}</label>
                  <select
                    value={orgData.company_size}
                    onChange={(e) => handleChange('company_size', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">{labels.notSet[language]}</option>
                    <option value="1-10">{labels.size_1_10[language]}</option>
                    <option value="11-50">{labels.size_11_50[language]}</option>
                    <option value="51-200">{labels.size_51_200[language]}</option>
                    <option value="201-500">{labels.size_201_500[language]}</option>
                    <option value="500+">{labels.size_500_plus[language]}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {labels.cancel[language]}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckIcon className="w-4 h-4" />
                <span>{saving ? labels.saving[language] : labels.save[language]}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}