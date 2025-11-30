// app/(dashboard)/settings/branding/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PaintBrushIcon,
  ArrowLeftIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '@/lib/LanguageContext';
import { useOrganization, useUpdateBranding, type BrandingColors } from '@/hooks/useOrganization';
import toast from 'react-hot-toast';

const DEFAULT_COLORS: BrandingColors = {
  primary: '#1e3a5f',
  secondary: '#2d5a7b',
  accent: '#d97706',
  success: '#047857',
  warning: '#eab308',
  danger: '#b91c1c',
};

const PRESET_PALETTES = {
  heavyEquipment: {
    name: { en: 'Heavy Equipment', fr: 'Équipement Lourd' },
    colors: {
      primary: '#1e3a5f',
      secondary: '#2d5a7b',
      accent: '#d97706',
      success: '#047857',
      warning: '#eab308',
      danger: '#b91c1c',
    },
  },
  constructionSite: {
    name: { en: 'Construction Site', fr: 'Chantier' },
    colors: {
      primary: '#78350f',
      secondary: '#92400e',
      accent: '#f59e0b',
      success: '#166534',
      warning: '#ca8a04',
      danger: '#dc2626',
    },
  },
  warehouseLogistics: {
    name: { en: 'Warehouse Logistics', fr: 'Logistique' },
    colors: {
      primary: '#0f172a',
      secondary: '#334155',
      accent: '#3b82f6',
      success: '#059669',
      warning: '#f59e0b',
      danger: '#ef4444',
    },
  },
};

export default function BrandingSettingsPage() {
  const { language } = useLanguage();
  const { data: organization, isLoading } = useOrganization();
  const { mutateAsync: updateBranding, isPending: saving } = useUpdateBranding();

  const [colors, setColors] = useState<BrandingColors>(DEFAULT_COLORS);

  useEffect(() => {
    if (organization?.branding_colors) {
      setColors(organization.branding_colors);
    }
  }, [organization]);

  const labels = {
    pageTitle: { en: 'Theme', fr: 'Thème' },
    pageSubtitle: { en: 'Customize your interface colors', fr: 'Personnalisez les couleurs de votre interface' },
    back: { en: 'Back to Settings', fr: 'Retour aux Paramètres' },
    colorPalette: { en: 'Color Palette', fr: 'Palette de Couleurs' },
    colorPaletteDesc: { en: 'Professional industrial colors', fr: 'Couleurs industrielles professionnelles' },
    presets: { en: 'Preset Palettes', fr: 'Palettes Prédéfinies' },
    preview: { en: 'Preview', fr: 'Aperçu' },
    previewDesc: { en: 'See how your colors look', fr: 'Visualisez vos couleurs' },
    compliant: { en: 'Compliant', fr: 'Conforme' },
    warning: { en: 'Warning', fr: 'Attention' },
    critical: { en: 'Critical', fr: 'Critique' },
    save: { en: 'Save Colors', fr: 'Enregistrer' },
    saving: { en: 'Saving...', fr: 'Enregistrement...' },
    reset: { en: 'Reset to Default', fr: 'Réinitialiser' },
    cancel: { en: 'Cancel', fr: 'Annuler' },
    saveSuccess: { en: 'Branding saved successfully', fr: 'Identité visuelle enregistrée' },
    saveError: { en: 'Error saving branding', fr: 'Erreur lors de l\'enregistrement' },
    primary: { en: 'Primary', fr: 'Principale' },
    primaryHelp: { en: 'Headers and main elements', fr: 'En-têtes et éléments principaux' },
    secondary: { en: 'Secondary', fr: 'Secondaire' },
    secondaryHelp: { en: 'Supporting elements', fr: 'Éléments de support' },
    accent: { en: 'Accent', fr: 'Accent' },
    accentHelp: { en: 'Buttons and interactive elements', fr: 'Boutons et éléments interactifs' },
    success: { en: 'Success', fr: 'Succès' },
    successHelp: { en: 'Compliant status', fr: 'Statuts conformes' },
    warningColor: { en: 'Warning', fr: 'Avertissement' },
    warningHelp: { en: 'Alerts and attention', fr: 'Alertes et attention' },
    danger: { en: 'Danger', fr: 'Danger' },
    dangerHelp: { en: 'Critical status', fr: 'Statuts critiques' },
  };

  const colorFields = [
    { key: 'primary', label: labels.primary, help: labels.primaryHelp },
    { key: 'secondary', label: labels.secondary, help: labels.secondaryHelp },
    { key: 'accent', label: labels.accent, help: labels.accentHelp },
    { key: 'success', label: labels.success, help: labels.successHelp },
    { key: 'warning', label: labels.warningColor, help: labels.warningHelp },
    { key: 'danger', label: labels.danger, help: labels.dangerHelp },
  ] as const;

  const updateColor = (key: keyof BrandingColors, value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
  };

  const applyPreset = (preset: keyof typeof PRESET_PALETTES) => {
    setColors(PRESET_PALETTES[preset].colors);
  };

  const resetToDefault = () => {
    setColors(DEFAULT_COLORS);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateBranding(colors);
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <PaintBrushIcon className="w-5 h-5 text-purple-600" />
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

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Color Palette */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                {labels.colorPalette[language]}
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                {labels.colorPaletteDesc[language]}
              </p>

              <div className="space-y-4">
                {colorFields.map(({ key, label, help }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700">
                        {label[language]}
                      </label>
                      <p className="text-xs text-gray-500">{help[language]}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={colors[key]}
                        onChange={(e) => updateColor(key, e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                      />
                      <input
                        type="text"
                        value={colors[key]}
                        onChange={(e) => updateColor(key, e.target.value)}
                        className="w-24 px-2 py-1 text-sm font-mono border border-gray-300 rounded"
                        pattern="^#[0-9A-Fa-f]{6}$"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Presets */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-900 mb-3">
                  {labels.presets[language]}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(PRESET_PALETTES) as Array<keyof typeof PRESET_PALETTES>).map((presetKey) => (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() => applyPreset(presetKey)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      {PRESET_PALETTES[presetKey].name[language]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                {labels.preview[language]}
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                {labels.previewDesc[language]}
              </p>

              <div className="space-y-3">
                {/* Header Preview */}
                <div
                  className="p-4 rounded-lg text-white"
                  style={{ backgroundColor: colors.primary }}
                >
                  <p className="font-medium">TraviXO Dashboard</p>
                  <p className="text-sm opacity-80">
                    {language === 'fr' ? 'Aperçu de l\'en-tête' : 'Header Preview'}
                  </p>
                </div>

                {/* Status Cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div
                    className="p-3 rounded-lg text-white text-center"
                    style={{ backgroundColor: colors.success }}
                  >
                    <CheckIcon className="w-5 h-5 mx-auto mb-1" />
                    <p className="text-xs font-medium">{labels.compliant[language]}</p>
                  </div>
                  <div
                    className="p-3 rounded-lg text-white text-center"
                    style={{ backgroundColor: colors.warning }}
                  >
                    <p className="text-lg font-bold mb-1">!</p>
                    <p className="text-xs font-medium">{labels.warning[language]}</p>
                  </div>
                  <div
                    className="p-3 rounded-lg text-white text-center"
                    style={{ backgroundColor: colors.danger }}
                  >
                    <p className="text-lg font-bold mb-1">X</p>
                    <p className="text-xs font-medium">{labels.critical[language]}</p>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex space-x-2">
                  <button
                    type="button"
                    className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium"
                    style={{ backgroundColor: colors.accent }}
                  >
                    {language === 'fr' ? 'Bouton Principal' : 'Primary Button'}
                  </button>
                  <button
                    type="button"
                    className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium"
                    style={{ backgroundColor: colors.secondary }}
                  >
                    {language === 'fr' ? 'Secondaire' : 'Secondary'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={resetToDefault}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {labels.reset[language]}
            </button>
            <div className="flex space-x-4">
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
          </div>
        </form>
      </div>
    </div>
  );
}