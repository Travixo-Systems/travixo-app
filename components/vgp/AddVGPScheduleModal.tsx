// components/vgp/AddVGPScheduleModal.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, CheckCircle, Upload, FileText, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/client';
import { useUploadThing } from '@/lib/uploadthing';

interface Asset {
  id: string;
  name: string;
  serial_number?: string;
  category?: string;
}

interface AddVGPScheduleModalProps {
  asset: Asset;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'form' | 'summary';

export default function AddVGPScheduleModal({ asset, onClose, onSuccess }: AddVGPScheduleModalProps) {
  const { language } = useLanguage();
  const t = createTranslator(language);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('form');
  const [existingSchedule, setExistingSchedule] = useState<any>(null);
  const [formData, setFormData] = useState({
    interval_months: 12,
    last_inspection_date: '',
    created_by: '',
    notes: ''
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { startUpload, isUploading } = useUploadThing('vgpCertificate', {
    onUploadError: (error: Error) => {
      setError(language === 'fr'
        ? `Erreur de téléchargement: ${error.message}`
        : `Upload error: ${error.message}`);
    },
    onUploadProgress: (progress) => setUploadProgress(progress),
  });

  useEffect(() => {
    fetchEquipmentTypes();
    fetchExistingSchedule();
  }, []);

  const fetchExistingSchedule = async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('vgp_schedules')
        .select('id, interval_months, last_inspection_date, next_due_date, notes, created_by, rapport_url')
        .eq('asset_id', asset.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setExistingSchedule(data);
        setFormData(prev => ({
          ...prev,
          interval_months: data.interval_months || prev.interval_months,
          last_inspection_date: data.last_inspection_date || prev.last_inspection_date,
          created_by: data.created_by || prev.created_by,
          notes: data.notes || prev.notes,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch existing schedule:', err);
    }
  };

  const fetchEquipmentTypes = async () => {
    try {
      const res = await fetch('/api/vgp/equipment-types');
      const data = await res.json();
      const matchingType = data.equipment_types?.find(
        (type: any) => type.name.toLowerCase().includes(asset.category?.toLowerCase() || '')
      );
      if (matchingType) {
        setFormData(prev => ({ ...prev, interval_months: matchingType.default_interval_months }));
      }
    } catch (error) {
      console.error('Failed to fetch equipment types:', error);
    }
  };

  const validateForm = (): boolean => {
    const errors: string[] = [];

    if (!formData.interval_months || formData.interval_months < 1) {
      errors.push(t('vgpScheduleModal.errorIntervalRequired'));
    }

    if (!formData.last_inspection_date) {
      errors.push(t('vgpScheduleModal.errorDateRequired'));
    } else {
      const inspectionDate = new Date(formData.last_inspection_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (inspectionDate > today) {
        errors.push(t('vgpScheduleModal.errorDateFuture'));
      }

      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(today.getFullYear() - 5);
      if (inspectionDate < fiveYearsAgo) {
        errors.push(t('vgpScheduleModal.errorDateTooOld'));
      }
    }

    if (!formData.created_by || formData.created_by.trim().length === 0) {
      errors.push(t('vgpScheduleModal.errorCreatedByRequired'));
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleContinueToSummary = () => {
    setError(null);
    setValidationErrors([]);
    if (validateForm()) {
      setStep('summary');
    }
  };

  const handleConfirmAndSave = async () => {
    setSubmitting(true);
    setError(null);

    try {
      let rapportUrl: string | null = null;

      if (selectedFile) {
        const uploadResult = await startUpload([selectedFile]);
        if (!uploadResult || uploadResult.length === 0) {
          throw new Error(language === 'fr'
            ? 'Échec du téléchargement du rapport'
            : 'Failed to upload report');
        }
        rapportUrl = uploadResult[0].ufsUrl;
      }

      const res = await fetch('/api/vgp/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: asset.id,
          ...formData,
          rapport_url: rapportUrl,
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('vgpScheduleModal.errorCreationFailed'));
      }

      onSuccess();
    } catch (error: any) {
      console.error('Failed to create VGP schedule:', error);
      setError(error.message || t('vgpScheduleModal.errorGeneric'));
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      setError(language === 'fr'
        ? 'Format accepté : PDF ou image (JPG, PNG)'
        : 'Accepted formats: PDF or image (JPG, PNG)');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(language === 'fr'
        ? 'Le fichier ne doit pas dépasser 8 Mo'
        : 'File must be under 8 MB');
      return;
    }
    setError(null);
    setSelectedFile(file);
  };

  const calculateNextDueDate = () => {
    if (!formData.last_inspection_date) return null;
    try {
      const lastDate = new Date(formData.last_inspection_date);
      if (isNaN(lastDate.getTime())) return null;
      const nextDate = new Date(lastDate);
      nextDate.setMonth(nextDate.getMonth() + formData.interval_months);
      return nextDate;
    } catch {
      return null;
    }
  };

  const nextDueDate = calculateNextDueDate();
  const daysUntil = nextDueDate ? Math.ceil((nextDueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
  const isOverdue = daysUntil !== null && daysUntil < 0;

  const isFormValid = formData.last_inspection_date &&
                      formData.interval_months > 0 &&
                      formData.created_by.trim().length > 0;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const intervalLabel = formData.interval_months === 6
    ? t('vgpScheduleModal.interval6Months')
    : formData.interval_months === 24
    ? t('vgpScheduleModal.interval24Months')
    : t('vgpScheduleModal.interval12Months');

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="rounded-xl max-w-[560px] w-full max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-6" style={{ borderBottom: '0.5px solid #dcdee3' }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
              {existingSchedule ? t('vgpScheduleModal.titleUpdate') : t('vgpScheduleModal.title')}
            </h2>
            <p className="text-[14px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
              {step === 'summary'
                ? (language === 'fr' ? 'Vérifiez les informations avant de confirmer' : 'Review information before confirming')
                : (existingSchedule ? t('vgpScheduleModal.subtitleUpdate') : t('vgpScheduleModal.subtitle'))
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="transition-colors" style={{ color: 'var(--text-muted, #777)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary, #1a1a1a)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Asset Info */}
        <div className="p-4 mx-6 mt-6 rounded-lg" style={{ backgroundColor: 'var(--page-bg, #cbcdd4)' }}>
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{asset.name}</h3>
          <div className="flex items-center gap-4 mt-1 text-[14px]" style={{ color: 'var(--text-muted, #777)' }}>
            {asset.serial_number && <span>{t('vgpScheduleModal.serialNumber')}: {asset.serial_number}</span>}
            {asset.category && <span>{t('vgpScheduleModal.category')}: {asset.category}</span>}
          </div>
        </div>

        {/* Errors */}
        {validationErrors.length > 0 && (
          <div className="mx-6 mt-4 p-4 rounded-lg bg-red-50">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <ul className="list-disc list-inside space-y-1">
                {validationErrors.map((err, idx) => (
                  <li key={idx} className="text-[14px] text-red-700">{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {error && (
          <div className="mx-6 mt-4 p-4 rounded-lg bg-red-50">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-[14px]">{error}</span>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 1: FORM                                                     */}
        {/* ================================================================ */}
        {step === 'form' && (
          <div className="p-6 space-y-6">
            {/* Interval */}
            <div>
              <label className="block text-[14px] font-semibold mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                {t('vgpScheduleModal.intervalLabel')} <span className="text-[#dc2626]">*</span>
              </label>
              <select
                value={formData.interval_months}
                onChange={(e) => {
                  setFormData({ ...formData, interval_months: parseInt(e.target.value) });
                  setValidationErrors([]);
                }}
                className="w-full px-3 py-2 rounded-lg text-[14px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
                style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
              >
                <option value={6}>{t('vgpScheduleModal.interval6Months')}</option>
                <option value={12}>{t('vgpScheduleModal.interval12Months')}</option>
                <option value={24}>{t('vgpScheduleModal.interval24Months')}</option>
              </select>
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
                {t('vgpScheduleModal.intervalHelp')}
              </p>
            </div>

            {/* Last Inspection Date */}
            <div>
              <label className="block text-[14px] font-semibold mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                {t('vgpScheduleModal.lastInspectionDate')} <span className="text-[#dc2626]">*</span>
              </label>
              <input
                type="date"
                value={formData.last_inspection_date}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  setFormData({ ...formData, last_inspection_date: e.target.value });
                  setValidationErrors([]);
                }}
                className="w-full px-3 py-2 rounded-lg text-[14px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
                style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                required
              />
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
                {t('vgpScheduleModal.lastInspectionHelp')}
              </p>
            </div>

            {/* Next Due Date Preview */}
            {nextDueDate && (() => {
              const color = isOverdue ? '#dc2626' : 'var(--status-conforme, #059669)';
              const bgColor = isOverdue ? 'rgba(220,38,38,0.08)' : 'rgba(5,150,105,0.08)';
              return (
                <div className="p-4 rounded-lg" style={{ backgroundColor: bgColor, borderLeft: `3px solid ${color}`, borderRadius: '8px' }}>
                  <div className="flex items-start gap-2">
                    {isOverdue ? (
                      <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color }} />
                    ) : (
                      <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color }} />
                    )}
                    <div>
                      <p className="text-[14px] font-semibold" style={{ color: 'var(--text-muted, #777)' }}>
                        {isOverdue ? t('vgpScheduleModal.nextInspectionOverdue') : t('vgpScheduleModal.nextInspectionDue')}
                      </p>
                      <p className="text-lg font-bold" style={{ color }}>
                        {formatDate(nextDueDate.toISOString())}
                      </p>
                      <p className="text-[13px] mt-1" style={{ color }}>
                        {isOverdue
                          ? `${Math.abs(daysUntil!)} ${t('vgpScheduleModal.daysOverdue')}`
                          : `${daysUntil} ${t('vgpScheduleModal.daysFromToday')}`
                        }
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Rapport Upload */}
            <div>
              <label className="block text-[14px] font-semibold mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                {language === 'fr' ? 'Joindre le rapport de vérification' : 'Attach inspection report'}
                <span className="text-[12px] font-normal ml-1" style={{ color: 'var(--text-muted, #777)' }}>
                  ({language === 'fr' ? 'optionnel' : 'optional'})
                </span>
              </label>
              {selectedFile ? (
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)' }}>
                  <FileText className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent, #e8600a)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium truncate" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {selectedFile.name}
                    </p>
                    <p className="text-[12px]" style={{ color: 'var(--text-muted, #777)' }}>
                      {(selectedFile.size / 1024 / 1024).toFixed(1)} Mo
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="p-1 rounded hover:bg-black/10 transition-colors"
                    style={{ color: 'var(--text-muted, #777)' }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed text-[14px] transition-colors hover:border-[#e8600a]"
                  style={{ borderColor: '#b8b8b8', color: 'var(--text-muted, #777)', backgroundColor: 'transparent' }}
                >
                  <Upload className="w-4 h-4" />
                  {language === 'fr' ? 'Sélectionner un fichier (PDF, JPG, PNG)' : 'Select file (PDF, JPG, PNG)'}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/jpeg,image/png"
                onChange={handleFileSelect}
                className="hidden"
              />
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
                {language === 'fr'
                  ? 'Le rapport prouve la date de dernière inspection. Max 8 Mo.'
                  : 'The report proves the last inspection date. Max 8 MB.'}
              </p>
            </div>

            {/* Created By */}
            <div>
              <label className="block text-[14px] font-semibold mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                {t('vgpScheduleModal.createdBy')} <span className="text-[#dc2626]">*</span>
              </label>
              <input
                type="text"
                value={formData.created_by}
                onChange={(e) => {
                  setFormData({ ...formData, created_by: e.target.value });
                  setValidationErrors([]);
                }}
                className="w-full px-3 py-2 rounded-lg text-[14px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
                style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                placeholder={t('vgpScheduleModal.createdByPlaceholder')}
                required
              />
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
                {t('vgpScheduleModal.createdByHelp')}
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[14px] font-semibold mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                {t('vgpScheduleModal.notes')}
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-[14px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]"
                style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
                rows={2}
                placeholder={t('vgpScheduleModal.notesPlaceholder')}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4" style={{ borderTop: '0.5px solid #dcdee3' }}>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-md text-[14px] font-medium transition-colors"
                style={{ color: 'var(--text-muted, #777)' }}
              >
                {t('vgpScheduleModal.cancel')}
              </button>
              <button
                type="button"
                onClick={handleContinueToSummary}
                disabled={!isFormValid}
                className="flex-1 px-4 py-2 text-white rounded-md text-[14px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--accent, #e8600a)' }}
              >
                {language === 'fr' ? 'Vérifier et confirmer' : 'Review & confirm'}
              </button>
            </div>

            <p className="text-[13px] text-center" style={{ color: 'var(--text-muted, #777)' }}>
              <span className="text-[#dc2626]">*</span> {t('vgpScheduleModal.requiredFields')}
            </p>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 2: SUMMARY & CONFIRM                                        */}
        {/* ================================================================ */}
        {step === 'summary' && (
          <div className="p-6 space-y-5">
            {/* Summary rows */}
            <div className="space-y-3">
              <SummaryRow
                label={language === 'fr' ? 'Équipement' : 'Equipment'}
                value={asset.name}
              />
              {asset.serial_number && (
                <SummaryRow
                  label={t('vgpScheduleModal.serialNumber')}
                  value={asset.serial_number}
                />
              )}
              <SummaryRow
                label={t('vgpScheduleModal.intervalLabel')}
                value={intervalLabel}
              />
              <SummaryRow
                label={t('vgpScheduleModal.lastInspectionDate')}
                value={formatDate(formData.last_inspection_date)}
              />
              {nextDueDate && (
                <SummaryRow
                  label={language === 'fr' ? 'Prochaine inspection' : 'Next inspection'}
                  value={formatDate(nextDueDate.toISOString())}
                  valueColor={isOverdue ? '#dc2626' : 'var(--status-conforme, #059669)'}
                  extra={isOverdue
                    ? `${Math.abs(daysUntil!)} ${t('vgpScheduleModal.daysOverdue')}`
                    : `${daysUntil} ${t('vgpScheduleModal.daysFromToday')}`
                  }
                  extraColor={isOverdue ? '#dc2626' : 'var(--status-conforme, #059669)'}
                />
              )}
              <SummaryRow
                label={t('vgpScheduleModal.createdBy')}
                value={formData.created_by}
              />
              {selectedFile && (
                <SummaryRow
                  label={language === 'fr' ? 'Rapport joint' : 'Attached report'}
                  value={selectedFile.name}
                  icon={<FileText className="w-4 h-4 inline mr-1" style={{ color: 'var(--accent, #e8600a)' }} />}
                />
              )}
              {!selectedFile && (
                <SummaryRow
                  label={language === 'fr' ? 'Rapport joint' : 'Attached report'}
                  value={language === 'fr' ? 'Aucun — date auto-déclarée' : 'None — self-declared date'}
                  valueColor="var(--text-hint, #888)"
                />
              )}
              {formData.notes && (
                <SummaryRow
                  label={t('vgpScheduleModal.notes')}
                  value={formData.notes}
                />
              )}
            </div>

            {/* Upload progress */}
            {isUploading && (
              <div className="space-y-1">
                <div className="w-full h-2 rounded-full" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)' }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%`, backgroundColor: 'var(--accent, #e8600a)' }}
                  />
                </div>
                <p className="text-[12px] text-center" style={{ color: 'var(--text-muted, #777)' }}>
                  {language === 'fr' ? 'Téléchargement du rapport...' : 'Uploading report...'} {uploadProgress}%
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4" style={{ borderTop: '0.5px solid #dcdee3' }}>
              <button
                type="button"
                onClick={() => setStep('form')}
                disabled={submitting}
                className="flex-1 px-4 py-2 rounded-md text-[14px] font-medium transition-colors"
                style={{ color: 'var(--text-muted, #777)' }}
              >
                {language === 'fr' ? 'Modifier' : 'Edit'}
              </button>
              <button
                type="button"
                onClick={handleConfirmAndSave}
                disabled={submitting || isUploading}
                className="flex-1 px-4 py-2 text-white rounded-md text-[14px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--accent, #e8600a)' }}
              >
                {submitting || isUploading
                  ? t('vgpScheduleModal.submitting')
                  : (existingSchedule ? t('vgpScheduleModal.submitUpdate') : t('vgpScheduleModal.submit'))
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Summary row component
// ============================================================================

function SummaryRow({ label, value, valueColor, extra, extraColor, icon }: {
  label: string;
  value: string;
  valueColor?: string;
  extra?: string;
  extraColor?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start py-2 px-3 rounded-lg" style={{ backgroundColor: 'var(--page-bg, #cbcdd4)' }}>
      <span className="text-[13px] font-medium" style={{ color: 'var(--text-muted, #777)' }}>{label}</span>
      <div className="text-right">
        <span className="text-[14px] font-semibold" style={{ color: valueColor || 'var(--text-primary, #1a1a1a)' }}>
          {icon}{value}
        </span>
        {extra && (
          <p className="text-[12px]" style={{ color: extraColor || 'var(--text-muted, #777)' }}>{extra}</p>
        )}
      </div>
    </div>
  );
}
