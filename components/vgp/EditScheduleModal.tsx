// components/vgp/EditScheduleModal.tsx
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';

interface EditScheduleModalProps {
  schedule: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditScheduleModal({ schedule, isOpen, onClose, onSuccess }: EditScheduleModalProps) {
  const { language } = useLanguage();
  const t = createTranslator(language);

  const [nextDueDate, setNextDueDate] = useState(schedule.next_due_date);
  const [notes, setNotes] = useState(schedule.notes || '');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Require reason if date changed
    if (nextDueDate !== schedule.next_due_date && !reason.trim()) {
      setError(t('vgpEditModal.errorReasonRequired'));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/vgp/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_due_date: nextDueDate, notes, reason })
      });

      if (!response.ok) throw new Error(t('vgpEditModal.errorUpdateFailed'));

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const dateChanged = nextDueDate !== schedule.next_due_date;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{t('vgpEditModal.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('vgpEditModal.equipment')}
            </label>
            <div className="text-sm text-gray-900">{schedule.assets?.name}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('vgpEditModal.nextDueDate')} *
            </label>
            <input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('vgpEditModal.notes')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t('vgpEditModal.notesPlaceholder')}
            />
          </div>

          {dateChanged && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('vgpEditModal.reasonForChange')} *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('vgpEditModal.reasonPlaceholder')}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('vgpEditModal.reasonHelp')}
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={isSubmitting}
            >
              {t('vgpEditModal.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? t('vgpEditModal.saving') : t('vgpEditModal.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}