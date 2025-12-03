// app/(dashboard)/settings/theme/page.tsx (renamed from branding)
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PaintBrushIcon,
  ArrowLeftIcon,
  PencilIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '@/lib/LanguageContext';
import { useOrganization, useUpdateBranding, type BrandingColors } from '@/hooks/useOrganization';
import toast from 'react-hot-toast';

const COLOR_PRESETS = {
  industrial_blue: {
    name: { en: 'Industrial Blue', fr: 'Bleu Industriel' },
    colors: {
      primary: '#1e3a5f',
      secondary: '#2d5a7b',
      accent: '#d97706',
      success: '#047857',
      warning: '#eab308',
      danger: '#b91c1c',
    },
  },
  construction_orange: {
    name: { en: 'Construction Orange', fr: 'Orange Chantier' },
    colors: {
      primary: '#ea580c',
      secondary: '#c2410c',
      accent: '#0891b2',
      success: '#16a34a',
      warning: '#eab308',
      danger: '#dc2626',
    },
  },
  logistics_green: {
    name: { en: 'Logistics Green', fr: 'Vert Logistique' },
    colors: {
      primary: '#047857',
      secondary: '#059669',
      accent: '#0284c7',
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#ef4444',
    },
  },
};

export default function ThemeSettingsPage() {
  const { language } = useLanguage();
  const { data: organization, isLoading } = useOrganization();
  const { mutateAsync: updateBranding, isPending: saving } = useUpdateBranding();

  const [isEditing, setIsEditing] = useState(false);
  const [colors, setColors] = useState<BrandingColors>({
    primary: '#1e3a5f',
    secondary: '#2d5a7b',
    accent: '#d97706',
    success: '#047857',
    warning: '#eab308',
    danger: '#b91c1c',
  });

  useEffect(() => {
    if (organization?.branding_colors) {
      setColors(organization.branding_colors);
    }
  }, [organization]);

  const labels = {
    pageTitle: { en: 'Theme', fr: 'Thème' },
    pageSubtitle: { en: 'Customize colors and appearance', fr: 'Personnalisez les couleurs et l\'apparence' },
    back: { en: 'Back to Settings', fr: 'Retour aux Paramètres' },
    edit: { en: 'Edit', fr: 'Modifier' },
    save: { en: 'Save Changes', fr: 'Enregistrer' },
    cancel: { en: 'Cancel', fr: 'Annuler' },
    saving: { en: 'Saving...', fr: 'Enregistrement...' },
    saveSuccess: { en: 'Theme saved! Refreshing...', fr: 'Thème enregistré! Actualisation...' },
    saveError: { en: 'Error saving theme', fr: 'Erreur lors de l\'enregistrement' },
    
    colors: { en: 'Colors', fr: 'Couleurs' },
    colorsDesc: { en: 'Customize your brand colors', fr: 'Personnalisez vos couleurs de marque' },
    primary: { en: 'Primary', fr: 'Primaire' },
    primaryDesc: { en: 'Main brand color (sidebar, buttons)', fr: 'Couleur principale (barre latérale, boutons)' },
    secondary: { en: 'Secondary', fr: 'Secondaire' },
    secondaryDesc: { en: 'Secondary brand color', fr: 'Couleur secondaire' },
    accent: { en: 'Accent', fr: 'Accentuation' },
    accentDesc: { en: 'Accent color for highlights', fr: 'Couleur d\'accentuation' },
    success: { en: 'Success', fr: 'Succès' },
    successDesc: { en: 'Success states and confirmations', fr: 'États de succès et confirmations' },
    warning: { en: 'Warning', fr: 'Avertissement' },
    warningDesc: { en: 'Warning states and alerts', fr: 'États d\'avertissement et alertes' },
    danger: { en: 'Danger', fr: 'Danger' },
    dangerDesc: { en: 'Error states and destructive actions', fr: 'États d\'erreur et actions destructrices' },
    
    presets: { en: 'Color Presets', fr: 'Préréglages de Couleurs' },
    presetsDesc: { en: 'Quick color schemes for your industry', fr: 'Palettes rapides pour votre secteur' },
    applyPreset: { en: 'Apply Preset', fr: 'Appliquer le préréglage' },
    
    preview: { en: 'Preview', fr: 'Aperçu' },
    previewDesc: { en: 'See how your theme looks', fr: 'Voir le rendu de votre thème' },
    sampleButton: { en: 'Sample Button', fr: 'Bouton d\'exemple' },
    sampleSuccess: { en: 'Success Message', fr: 'Message de succès' },
    sampleWarning: { en: 'Warning Alert', fr: 'Alerte d\'avertissement' },
    sampleDanger: { en: 'Error State', fr: 'État d\'erreur' },
  };

  const handleColorChange = (key: keyof BrandingColors, value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
  };

  const handleApplyPreset = (presetKey: keyof typeof COLOR_PRESETS) => {
    setColors(COLOR_PRESETS[presetKey].colors);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all colors are present
    const requiredColors = ['primary', 'secondary', 'accent', 'success', 'warning', 'danger'];
    const missingColors = requiredColors.filter(key => !colors[key as keyof BrandingColors]);
    
    if (missingColors.length > 0) {
      toast.error(`Missing colors: ${missingColors.join(', ')}`);
      return;
    }
    
    try {
      // Hook expects BrandingColors directly, it wraps in { colors: ... } internally
      await updateBranding(colors);
      toast.success(labels.saveSuccess[language]);
      setIsEditing(false);
      
      // Reload page to apply new theme
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error: any) {
      toast.error(error.message || labels.saveError[language]);
      console.error('Branding update error:', error);
    }
  };

  const handleCancelEdit = () => {
    if (organization?.branding_colors) {
      setColors(organization.branding_colors);
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
              <PaintBrushIcon className="w-5 h-5 text-blue-600" />
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
            {/* Current Colors */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.colors[language]}
              </h3>

              <div className="space-y-3">
                <ColorDisplay label={labels.primary[language]} color={colors.primary} />
                <ColorDisplay label={labels.secondary[language]} color={colors.secondary} />
                <ColorDisplay label={labels.accent[language]} color={colors.accent} />
                <ColorDisplay label={labels.success[language]} color={colors.success} />
                <ColorDisplay label={labels.warning[language]} color={colors.warning} />
                <ColorDisplay label={labels.danger[language]} color={colors.danger} />
              </div>
            </div>

            {/* Preview */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.preview[language]}
              </h3>

              <div className="space-y-3">
                <button
                  style={{ backgroundColor: colors.primary }}
                  className="px-4 py-2 text-white rounded-lg font-medium"
                >
                  {labels.sampleButton[language]}
                </button>
                
                <div
                  style={{ backgroundColor: `${colors.success}20`, borderColor: colors.success }}
                  className="p-3 rounded-lg border-l-4 text-sm"
                >
                  <span style={{ color: colors.success }} className="font-medium">✓ </span>
                  {labels.sampleSuccess[language]}
                </div>

                <div
                  style={{ backgroundColor: `${colors.warning}20`, borderColor: colors.warning }}
                  className="p-3 rounded-lg border-l-4 text-sm"
                >
                  <span style={{ color: colors.warning }} className="font-medium">⚠ </span>
                  {labels.sampleWarning[language]}
                </div>

                <div
                  style={{ backgroundColor: `${colors.danger}20`, borderColor: colors.danger }}
                  className="p-3 rounded-lg border-l-4 text-sm"
                >
                  <span style={{ color: colors.danger }} className="font-medium">✕ </span>
                  {labels.sampleDanger[language]}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EDIT MODE */}
        {isEditing && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Color Presets */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-2">
                {labels.presets[language]}
              </h3>
              <p className="text-xs text-gray-500 mb-4">{labels.presetsDesc[language]}</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleApplyPreset(key as keyof typeof COLOR_PRESETS)}
                    className="p-4 border-2 border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-2 mb-3">
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: preset.colors.primary }}
                      />
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: preset.colors.secondary }}
                      />
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: preset.colors.accent }}
                      />
                    </div>
                    <div className="text-sm font-medium text-gray-900">
                      {preset.name[language]}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Color Customization */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-2">
                {labels.colors[language]}
              </h3>
              <p className="text-xs text-gray-500 mb-4">{labels.colorsDesc[language]}</p>

              <div className="space-y-4">
                <ColorPicker
                  label={labels.primary[language]}
                  description={labels.primaryDesc[language]}
                  value={colors.primary}
                  onChange={(value) => handleColorChange('primary', value)}
                />

                <ColorPicker
                  label={labels.secondary[language]}
                  description={labels.secondaryDesc[language]}
                  value={colors.secondary}
                  onChange={(value) => handleColorChange('secondary', value)}
                />

                <ColorPicker
                  label={labels.accent[language]}
                  description={labels.accentDesc[language]}
                  value={colors.accent}
                  onChange={(value) => handleColorChange('accent', value)}
                />

                <ColorPicker
                  label={labels.success[language]}
                  description={labels.successDesc[language]}
                  value={colors.success}
                  onChange={(value) => handleColorChange('success', value)}
                />

                <ColorPicker
                  label={labels.warning[language]}
                  description={labels.warningDesc[language]}
                  value={colors.warning}
                  onChange={(value) => handleColorChange('warning', value)}
                />

                <ColorPicker
                  label={labels.danger[language]}
                  description={labels.dangerDesc[language]}
                  value={colors.danger}
                  onChange={(value) => handleColorChange('danger', value)}
                />
              </div>
            </div>

            {/* Preview */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                {labels.preview[language]}
              </h3>

              <div className="space-y-3">
                <button
                  type="button"
                  style={{ backgroundColor: colors.primary }}
                  className="px-4 py-2 text-white rounded-lg font-medium"
                >
                  {labels.sampleButton[language]}
                </button>
                
                <div
                  style={{ backgroundColor: `${colors.success}20`, borderColor: colors.success }}
                  className="p-3 rounded-lg border-l-4 text-sm"
                >
                  <span style={{ color: colors.success }} className="font-medium">✓ </span>
                  {labels.sampleSuccess[language]}
                </div>

                <div
                  style={{ backgroundColor: `${colors.warning}20`, borderColor: colors.warning }}
                  className="p-3 rounded-lg border-l-4 text-sm"
                >
                  <span style={{ color: colors.warning }} className="font-medium">⚠ </span>
                  {labels.sampleWarning[language]}
                </div>

                <div
                  style={{ backgroundColor: `${colors.danger}20`, borderColor: colors.danger }}
                  className="p-3 rounded-lg border-l-4 text-sm"
                >
                  <span style={{ color: colors.danger }} className="font-medium">✕ </span>
                  {labels.sampleDanger[language]}
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

// Helper Components
function ColorDisplay({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-200 last:border-0">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center space-x-3">
        <span className="text-sm font-mono text-gray-600">{color}</span>
        <div
          className="w-8 h-8 rounded border border-gray-300"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function ColorPicker({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <p className="text-xs text-gray-500 mb-2">{description}</p>
      <div className="flex items-center space-x-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-12 rounded border border-gray-300 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          pattern="^#[0-9A-Fa-f]{6}$"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  );
}