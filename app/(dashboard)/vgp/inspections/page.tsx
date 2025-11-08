'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { FileText, Download, ExternalLink } from 'lucide-react';

interface Inspection {
  id: string;
  asset_name: string;
  asset_serial: string;
  asset_category: string;
  inspection_date: string;
  inspector_name: string;
  inspector_company: string;
  result: 'passed' | 'conditional' | 'failed';
  certificate_url: string | null;
  next_inspection_date: string;
}

const RESULT_CONFIG = {
  passed: { label: 'Conforme', color: 'bg-green-50 text-green-700 border-green-200' },
  conditional: { label: 'Conditionnel', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  failed: { label: 'Non Conforme', color: 'bg-red-50 text-red-700 border-red-200' }
};

export default function VGPInspectionsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [filteredInspections, setFilteredInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchInspections();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [inspections, searchTerm, resultFilter, startDate, endDate]);

  async function fetchInspections() {
    try {
      const res = await fetch('/api/vgp/inspections/history');
      if (!res.ok) {
        const errorText = await res.text();
        console.error('API Response:', res.status, errorText);
        throw new Error(`Failed to fetch: ${res.status}`);
      }
      const data = await res.json();
      console.log('Fetched inspections:', data);
      setInspections(data.inspections || []);
    } catch (error) {
      console.error('Error fetching inspections:', error);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    let filtered = [...inspections];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(i => 
        i.asset_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.inspector_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Result filter
    if (resultFilter !== 'all') {
      filtered = filtered.filter(i => i.result === resultFilter);
    }

    // Date range filter
    if (startDate) {
      filtered = filtered.filter(i => new Date(i.inspection_date) >= new Date(startDate));
    }
    if (endDate) {
      filtered = filtered.filter(i => new Date(i.inspection_date) <= new Date(endDate));
    }

    setFilteredInspections(filtered);
    setCurrentPage(1);
  }

  async function exportCSV() {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (resultFilter !== 'all') params.set('result', resultFilter);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);

      const res = await fetch(`/api/vgp/inspections/export?${params}`);
      if (!res.ok) throw new Error('Export failed');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inspections_vgp_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
    } catch (error) {
      console.error('Export error:', error);
      alert('Erreur lors de l\'export');
    }
  }

  const paginatedInspections = filteredInspections.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredInspections.length / itemsPerPage);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historique des Inspections VGP</h1>
          <p className="text-sm text-gray-600 mt-1">
            {filteredInspections.length} inspection{filteredInspections.length !== 1 ? 's' : ''} trouvée{filteredInspections.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Download className="w-4 h-4" />
          Exporter CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rechercher
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Équipement ou inspecteur"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Résultat
            </label>
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Tous</option>
              <option value="passed">Conforme</option>
              <option value="conditional">Conditionnel</option>
              <option value="failed">Non Conforme</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date début
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date fin
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Équipement</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Inspecteur</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Société</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Résultat</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Certificat</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Prochaine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedInspections.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    Aucune inspection trouvée
                  </td>
                </tr>
              ) : (
                paginatedInspections.map((inspection) => (
                  <tr key={inspection.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{inspection.asset_name}</div>
                      <div className="text-xs text-gray-500">{inspection.asset_category}</div>
                      <div className="text-xs text-gray-400">S/N: {inspection.asset_serial}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {format(new Date(inspection.inspection_date), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {inspection.inspector_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {inspection.inspector_company}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium border ${RESULT_CONFIG[inspection.result].color}`}>
                        {RESULT_CONFIG[inspection.result].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {inspection.certificate_url ? (
                        <a
                          href={inspection.certificate_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                        >
                          <FileText className="w-4 h-4" />
                          Voir PDF
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">Aucun</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {format(new Date(inspection.next_inspection_date), 'dd/MM/yyyy')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Page {currentPage} sur {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Précédent
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}