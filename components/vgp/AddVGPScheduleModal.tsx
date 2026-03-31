// components/vgp/AddVGPScheduleModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';

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

export default function AddVGPScheduleModal({ asset, onClose, onSuccess }: AddVGPScheduleModalProps) {
  const { language } = useLanguage();
  const t = createTranslator(language);

  const [equipmentTypes, setEquipmentTypes] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    interval_months: 12,
    last_inspection_date: new Date().toISOString().split('T')[0],
    created_by: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    fetchEquipmentTypes();
  }, []);

  const fetchEquipmentTypes = async () => {
    try {
      const res = await fetch('/api/vgp/equipment-types');
      const data = await res.json();
      setEquipmentTypes(data.equipment_types || []);
      
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

    if (!asset || !asset.id) {
      errors.push(t('vgpScheduleModal.errorEquipmentInvalid'));
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationErrors([]);

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
      console.log('Submitting VGP schedule:', {
        asset_id: asset.id,
        asset_name: asset.name,
        ...formData
      });

      const res = await fetch('/api/vgp/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: asset.id,
          ...formData
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('vgpScheduleModal.errorCreationFailed'));
      }

      console.log('VGP schedule created:', data);
      onSuccess();
    } catch (error: any) {
      console.error('Failed to create VGP schedule:', error);
      setError(error.message || t('vgpScheduleModal.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  const calculateNextDueDate = () => {
    try {
      const lastDate = new Date(formData.last_inspection_date);
      const nextDate = new Date(lastDate);
      nextDate.setMonth(nextDate.getMonth() + formData.interval_months);
      return nextDate;
    } catch {
      return null;
    }
  };

  const nextDueDate = calculateNextDueDate();
  const isFormValid = validationErrors.length === 0 && 
                      formData.last_inspection_date && 
                      formData.interval_months > 0 && 
                      formData.created_by.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="rounded-xl max-w-[560px] w-full max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-6" style={{ borderBottom: '0.5px solid #dcdee3' }}>
          <div>
            <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('vgpScheduleModal.title')}</h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
              {t('vgpScheduleModal.subtitle')}
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

        {/* Asset Info — equipment identity block */}
        <div className="p-4 mx-6 mt-6 rounded-lg" style={{ backgroundColor: 'var(--page-bg, #cbcdd4)' }}>
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{asset.name}</h3>
          <div className="flex items-center gap-4 mt-1 text-[13px]" style={{ color: 'var(--text-muted, #777)' }}>
            {asset.serial_number && <span>{t('vgpScheduleModal.serialNumber')}: {asset.serial_number}</span>}
            {asset.category && <span>{t('vgpScheduleModal.category')}: {asset.category}</span>}
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="p-6 bg-red-50 border-b border-red-100">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-red-900 mb-1">{t('vgpScheduleModal.validationErrors')}</h4>
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.map((err, idx) => (
                    <li key={idx} className="text-sm text-red-700">{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* API Error */}
        {error && (
          <div className="p-6 bg-red-50 border-b border-red-100">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Interval Selection */}
          <div>
            <label className="block text-[13px] font-medium mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
              {t('vgpScheduleModal.intervalLabel')} <span className="text-[#dc2626]">*</span>
            </label>
            <select
              value={formData.interval_months}
              onChange={(e) => {
                setFormData({ ...formData, interval_months: parseInt(e.target.value) });
                setValidationErrors([]);
              }}
              className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
              required
            >
              <option value={6}>{t('vgpScheduleModal.interval6Months')}</option>
              <option value={12}>{t('vgpScheduleModal.interval12Months')}</option>
              <option value={24}>{t('vgpScheduleModal.interval24Months')}</option>
            </select>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
              {t('vgpScheduleModal.intervalHelp')}
            </p>
          </div>

          {/* Last Inspection Date */}
          <div>
            <label className="block text-[13px] font-medium mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
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
              className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
              required
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
              {t('vgpScheduleModal.lastInspectionHelp')}
            </p>
          </div>

          {/* Calculate Next Due Date */}
          {nextDueDate && (
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(5,150,105,0.08)', borderLeft: '3px solid var(--status-conforme, #059669)', borderRadius: '8px' }}>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--status-conforme, #059669)' }} />
                <div>
                  <p className="text-[13px] font-medium" style={{ color: 'var(--text-muted, #777)' }}>
                    {t('vgpScheduleModal.nextInspectionDue')}
                  </p>
                  <p className="text-lg font-bold" style={{ color: 'var(--status-conforme, #059669)' }}>
                    {nextDueDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { 
                      day: 'numeric', 
                      month: 'long', 
                      year: 'numeric' 
                    })}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--status-conforme, #059669)' }}>
                    {Math.ceil((nextDueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} {t('vgpScheduleModal.daysFromToday')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Created By */}
          <div>
            <label className="block text-[13px] font-medium mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
              {t('vgpScheduleModal.createdBy')} <span className="text-[#dc2626]">*</span>
            </label>
            <input
              type="text"
              value={formData.created_by}
              onChange={(e) => {
                setFormData({ ...formData, created_by: e.target.value });
                setValidationErrors([]);
              }}
              className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
              placeholder={t('vgpScheduleModal.createdByPlaceholder')}
              required
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
              {t('vgpScheduleModal.createdByHelp')}
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[13px] font-medium mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
              {t('vgpScheduleModal.notes')}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-[13px] border-none focus:outline-none focus:ring-2 focus:ring-[#e8600a]" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-primary, #1a1a1a)' }}
              rows={3}
              placeholder={t('vgpScheduleModal.notesPlaceholder')}
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted, #777)' }}>
              {t('vgpScheduleModal.notesHelp')}
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4" style={{ borderTop: '0.5px solid #dcdee3' }}>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-md font-medium transition-colors" style={{ color: 'var(--text-muted, #777)' }}
              disabled={submitting}
            >
              {t('vgpScheduleModal.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !isFormValid}
              className="flex-1 px-4 py-2 text-white rounded-md font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{ backgroundColor: 'var(--accent, #e8600a)' }}
            >
              {submitting ? t('vgpScheduleModal.submitting') : t('vgpScheduleModal.submit')}
            </button>
          </div>

          {/* Helper text */}
          <p className="text-xs text-gray-500 text-center">
            <span className="text-[#dc2626]">*</span> {t('vgpScheduleModal.requiredFields')}
          </p>
        </form>
      </div>
    </div>
  );
}