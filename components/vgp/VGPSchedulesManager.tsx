'use client';

import { useState, useEffect } from 'react';
import { Calendar, Search, Trash2, Eye, Filter, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface Asset {
  id: string;
  name: string;
  serial_number: string;
  category: string;
  location: string;
  qr_code: string;
}

interface Schedule {
  id: string;
  asset_id: string;
  interval_months: number;
  last_inspection_date: string | null;
  next_due_date: string;
  inspector_name: string | null;
  status: string;
  created_at: string;
  assets: Asset;
}

export default function VGPSchedulesManager() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchSchedules();
  }, [statusFilter]);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const url = statusFilter !== 'all' 
        ? `/api/vgp/schedules?status=${statusFilter}`
        : '/api/vgp/schedules';
      
      const res = await fetch(url);
      const data = await res.json();
      setSchedules(data.schedules || []);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce calendrier VGP ?')) return;
    
    try {
      const res = await fetch(`/api/vgp/schedules/${scheduleId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        alert('Calendrier VGP supprimé avec succès');
        fetchSchedules();
      } else {
        throw new Error('Failed to delete schedule');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const filteredSchedules = schedules.filter(schedule => 
    schedule.assets?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    schedule.assets?.serial_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (schedule: Schedule) => {
    const daysUntil = Math.ceil((new Date(schedule.next_due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntil < 0) {
      return <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">En retard</span>;
    } else if (daysUntil <= 7) {
      return <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-semibold">Urgent</span>;
    } else if (daysUntil <= 30) {
      return <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">À venir</span>;
    } else {
      return <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">OK</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendriers VGP</h1>
          <p className="text-gray-600 mt-1">Gérez les inspections périodiques de vos équipements</p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-2xl font-bold">{schedules.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="bg-red-100 p-3 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">En retard</p>
              <p className="text-2xl font-bold">
                {schedules.filter(s => new Date(s.next_due_date) < new Date()).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-100 p-3 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">À venir (30j)</p>
              <p className="text-2xl font-bold">
                {schedules.filter(s => {
                  const days = Math.ceil((new Date(s.next_due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return days >= 0 && days <= 30;
                }).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-3 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Conforme</p>
              <p className="text-2xl font-bold">
                {schedules.filter(s => {
                  const days = Math.ceil((new Date(s.next_due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return days > 30;
                }).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par nom d'équipement ou numéro de série..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="overdue">En retard</option>
              <option value="completed">Terminé</option>
            </select>
          </div>
        </div>
      </div>

      {/* Schedules Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Chargement des calendriers...</p>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">Aucun calendrier VGP trouvé</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Équipement</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Catégorie</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Emplacement</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Intervalle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prochaine inspection</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSchedules.map((schedule) => (
                <tr key={schedule.id} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-gray-900">{schedule.assets?.name || 'N/A'}</p>
                      <p className="text-sm text-gray-500">S/N: {schedule.assets?.serial_number || 'N/A'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-700">{schedule.assets?.category || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-700">{schedule.assets?.location || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-700">{schedule.interval_months} mois</td>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-gray-900">
                      {new Date(schedule.next_due_date).toLocaleDateString('fr-FR')}
                    </p>
                    <p className="text-sm text-gray-500">
                      {Math.ceil((new Date(schedule.next_due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} jours
                    </p>
                  </td>
                  <td className="px-6 py-4">{getStatusBadge(schedule)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedSchedule(schedule);
                          setShowDetails(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        title="Voir les détails"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(schedule.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                        title="Supprimer"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Details Modal */}
      {showDetails && selectedSchedule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Détails du calendrier VGP</h2>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Équipement</p>
                  <p className="font-semibold text-gray-900">{selectedSchedule.assets?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Numéro de série</p>
                  <p className="font-semibold text-gray-900">{selectedSchedule.assets?.serial_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Catégorie</p>
                  <p className="font-semibold text-gray-900">{selectedSchedule.assets?.category}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Emplacement</p>
                  <p className="font-semibold text-gray-900">{selectedSchedule.assets?.location}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Intervalle</p>
                  <p className="font-semibold text-gray-900">{selectedSchedule.interval_months} mois</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Prochaine inspection</p>
                  <p className="font-semibold text-gray-900">
                    {new Date(selectedSchedule.next_due_date).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                {selectedSchedule.last_inspection_date && (
                  <div>
                    <p className="text-sm text-gray-600">Dernière inspection</p>
                    <p className="font-semibold text-gray-900">
                      {new Date(selectedSchedule.last_inspection_date).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                )}
                {selectedSchedule.inspector_name && (
                  <div>
                    <p className="text-sm text-gray-600">Inspecteur</p>
                    <p className="font-semibold text-gray-900">{selectedSchedule.inspector_name}</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-2">Code QR</p>
                <p className="font-mono text-sm bg-gray-100 p-2 rounded">{selectedSchedule.assets?.qr_code}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDetails(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}