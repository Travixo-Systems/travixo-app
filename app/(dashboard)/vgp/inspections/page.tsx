'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { FileText, Download, ExternalLink } from 'lucide-react';
import FeatureGate from '@/components/subscription/FeatureGate';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';

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

function VGPInspectionsContent() {
  const { language } = useLanguage();
  const t = createTranslator(language);

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

  // Result configuration with translations
  const RESULT_CONFIG = {
    passed: { 
      label: t('vgpInspections.resultPassed'), 
      color: 'bg-green-50 text-green-700 border-green-200' 
    },
    conditional: { 
      label: t('vgpInspections.resultConditional'), 
      color: 'bg-yellow-50 text-yellow-700 border-yellow-200' 
    },
    failed: { 
      label: t('vgpInspections.resultFailed'), 
      color: 'bg-red-50 text-red-700 border-red-200' 
    }
  };

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
      alert(t('vgpInspections.exportError'));
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

  // Dynamic count text
  const countText = filteredInspections.length === 1 
    ? t('vgpInspections.inspectionsFound')
    : t('vgpInspections.inspectionsFoundPlural');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('vgpInspections.pageTitle')}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {filteredInspections.length} {countText}
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Download className="w-4 h-4" />
          {t('vgpInspections.exportCSV')}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('vgpInspections.search')}
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('vgpInspections.searchPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('vgpInspections.result')}
            </label>
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">{t('vgpInspections.all')}</option>
              <option value="passed">{t('vgpInspections.resultPassed')}</option>
              <option value="conditional">{t('vgpInspections.resultConditional')}</option>
              <option value="failed">{t('vgpInspections.resultFailed')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('vgpInspections.startDate')}
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
              {t('vgpInspections.endDate')}
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  {t('vgpInspections.equipment')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  {t('vgpInspections.date')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  {t('vgpInspections.inspector')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  {t('vgpInspections.company')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  {t('vgpInspections.result')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  {t('vgpInspections.certificate')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  {t('vgpInspections.nextInspection')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedInspections.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    {t('vgpInspections.noResults')}
                  </td>
                </tr>
              ) : (
                paginatedInspections.map((inspection) => (
                  <tr key={inspection.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{inspection.asset_name}</div>
                      <div className="text-xs text-gray-500">{inspection.asset_category}</div>
                      <div className="text-xs text-gray-400">
                        {t('vgpInspections.serialNumber')}: {inspection.asset_serial}
                      </div>
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
                          {t('vgpInspections.viewPDF')}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {t('vgpInspections.noCertificate')}
                        </span>
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
              {t('vgpInspections.pageOf')
                .replace('{current}', String(currentPage))
                .replace('{total}', String(totalPages))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                {t('vgpInspections.previous')}
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                {t('vgpInspections.next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VGPInspectionsPage() {
  return (
    <FeatureGate feature="vgp_compliance">
      <VGPInspectionsContent />
    </FeatureGate>
  );
}