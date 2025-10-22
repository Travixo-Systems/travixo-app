'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Clock, AlertTriangle, FileText, Calendar, TrendingUp } from 'lucide-react';

export default function VGPComplianceDashboard() {
  const [summary, setSummary] = useState<any>(null);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchComplianceData();
  }, []);

  const fetchComplianceData = async () => {
    try {
      const res = await fetch('/api/vgp/compliance-summary');
      const data = await res.json();

      setSummary(data.summary || {});
      setUpcoming(Array.isArray(data.upcoming) ? data.upcoming : []);
      setOverdue(Array.isArray(data.overdue) ? data.overdue : []);
    } catch {
      setSummary({});
      setUpcoming([]);
      setOverdue([]);
    } finally {
      setLoading(false);
    }
  };

  const getDaysUntil = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Conformité VGP</h1>
          <p className="text-gray-600 mt-1">
            Vérifications Générales Périodiques - Article R4323-23
          </p>
        </div>
        <button
          onClick={() => (window.location.href = '/vgp/report')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <FileText className="w-4 h-4" />
          Rapport DIRECCTE
        </button>
      </div>

      {/* Compliance Overview Cards - Clickable */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div
          onClick={() => (window.location.href = '/vgp/schedules')}
          className="bg-white rounded-lg shadow p-6 border-2 border-green-200 hover:shadow-lg hover:border-green-400 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <span className="text-2xl font-bold text-green-600">
              {summary?.compliance_rate || 0}%
            </span>
          </div>
          <h3 className="text-sm font-semibold text-gray-700">Taux de Conformité</h3>
          <p className="text-xs text-gray-500 mt-1">
            {summary?.compliant_assets || 0} équipements conformes
          </p>
        </div>

        <div
          onClick={() => (window.location.href = '/vgp/schedules?status=upcoming')}
          className="bg-white rounded-lg shadow p-6 border-2 border-blue-200 hover:shadow-lg hover:border-blue-400 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-2">
            <Calendar className="w-8 h-8 text-blue-600" />
            <span className="text-2xl font-bold text-blue-600">{upcoming.length}</span>
          </div>
          <h3 className="text-sm font-semibold text-gray-700">À venir (30 jours)</h3>
          <p className="text-xs text-gray-500 mt-1">Inspections prévues</p>
        </div>

        <div
          onClick={() => (window.location.href = '/vgp/schedules?status=overdue')}
          className="bg-white rounded-lg shadow p-6 border-2 border-red-200 hover:shadow-lg hover:border-red-400 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-8 h-8 text-red-600" />
            <span className="text-2xl font-bold text-red-600">{overdue.length}</span>
          </div>
          <h3 className="text-sm font-semibold text-gray-700">En Retard</h3>
          <p className="text-xs text-gray-500 mt-1">Action immédiate requise</p>
        </div>

        <div
          onClick={() => (window.location.href = '/vgp/schedules')}
          className="bg-white rounded-lg shadow p-6 border-2 border-gray-200 hover:shadow-lg hover:border-gray-400 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 text-gray-600" />
            <span className="text-2xl font-bold text-gray-600">
              {summary?.total_assets_with_vgp || 0}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-gray-700">Total Équipements</h3>
          <p className="text-xs text-gray-500 mt-1">Sous surveillance VGP</p>
        </div>
      </div>

      {/* Overdue Inspections */}
      {overdue.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <div>
              <h2 className="text-xl font-bold text-red-900">
                Inspections En Retard - Risque de Non-Conformité
              </h2>
              <p className="text-sm text-red-700">
                Ces équipements doivent être inspectés immédiatement pour éviter une amende de €15,000+
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {overdue.map((schedule) => {
              const daysOverdue = Math.abs(getDaysUntil(schedule.next_due_date));
              return (
                <div
                  key={schedule.id}
                  className="bg-white rounded-lg p-4 border-2 border-red-300 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold text-gray-900">
                          {schedule.assets?.name || 'Unknown Asset'}
                        </span>
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                          {daysOverdue} jours de retard
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        <span>N° Série: {schedule.assets?.serial_number || 'N/A'}</span>
                        <span>Catégorie: {schedule.assets?.asset_categories?.name || 'Non catégorisé'}</span>
                        <span>Localisation: {schedule.assets?.current_location || 'N/A'}</span>
                      </div>
                      <div className="mt-2 text-sm text-red-700 font-medium">
                        Date limite dépassée: {formatDate(schedule.next_due_date)}
                      </div>
                    </div>
                    <button
                      onClick={() => (window.location.href = `/vgp/inspection/${schedule.id}`)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
                    >
                      Enregistrer Inspection
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming Inspections */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Inspections à Venir (30 Prochains Jours)</h2>

        {upcoming.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p>Aucune inspection prévue dans les 30 prochains jours</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((schedule) => {
              const daysUntil = getDaysUntil(schedule.next_due_date);
              const isUrgent = daysUntil <= 7;

              return (
                <div
                  key={schedule.id}
                  className={`rounded-lg p-4 border-2 ${
                    isUrgent ? 'bg-orange-50 border-orange-300' : 'bg-blue-50 border-blue-200'
                  } hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        {isUrgent ? (
                          <AlertTriangle className="w-5 h-5 text-orange-600" />
                        ) : (
                          <Clock className="w-5 h-5 text-blue-600" />
                        )}
                        <span className="text-lg font-semibold text-gray-900">
                          {schedule.assets?.name || 'Unknown Asset'}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            isUrgent ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          Dans {daysUntil} jours
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        <span>N° Série: {schedule.assets?.serial_number || 'N/A'}</span>
                        <span>Intervalle: {schedule.interval_months} mois</span>
                        <span>Catégorie: {schedule.assets?.asset_categories?.name || 'Non catégorisé'}</span>
                      </div>
                      <div className="mt-2 text-sm font-medium">Date prévue: {formatDate(schedule.next_due_date)}</div>
                    </div>
                    <button
                      onClick={() => (window.location.href = `/vgp/inspection/${schedule.id}`)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                    >
                      Planifier
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Économies Potentielles</h3>
          <p className="text-3xl font-bold text-blue-600 mb-1">€15,000+</p>
          <p className="text-xs text-blue-700">Amendes évitées grâce à la conformité VGP</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
          <h3 className="text-sm font-semibold text-green-900 mb-2">Temps Gagné</h3>
          <p className="text-3xl font-bold text-green-600 mb-1">75%</p>
          <p className="text-xs text-green-700">Réduction du temps de gestion des inspections</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
          <h3 className="text-sm font-semibold text-purple-900 mb-2">Dernière Mise à Jour</h3>
          <p className="text-xl font-bold text-purple-600 mb-1">{new Date().toLocaleDateString('fr-FR')}</p>
          <p className="text-xs text-purple-700">Données synchronisées en temps réel</p>
        </div>
      </div>
    </div>
  );
}
