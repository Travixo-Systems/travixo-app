'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface EditScheduleModalProps {
  schedule: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditScheduleModal({ schedule, isOpen, onClose, onSuccess }: EditScheduleModalProps) {
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
      setError('Raison requise pour modifier la date');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/vgp/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_due_date: nextDueDate, notes, reason })
      });

      if (!response.ok) throw new Error('Échec de la mise à jour');

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
          <h2 className="text-xl font-semibold">Modifier le calendrier</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Équipement
            </label>
            <div className="text-sm text-gray-900">{schedule.assets?.name}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prochaine échéance *
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
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ajoutez des notes..."
            />
          </div>

          {dateChanged && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Raison du changement de date *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ex: Extension accordée par l'inspecteur"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Requis pour la conformité DIRECCTE
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
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}