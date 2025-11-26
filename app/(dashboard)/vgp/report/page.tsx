'use client';

import { useEffect, useState } from 'react';
import { FileText, Download, Calendar, AlertCircle, CheckCircle, XCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import FeatureGate from '@/components/subscription/FeatureGate';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';

interface Inspection {
  id: string;
  inspection_date: string;
  inspector_name: string;
  inspector_company: string;
  inspector_accreditation?: string;
  verification_type: 'PERIODIQUE' | 'INITIALE' | 'REMISE_SERVICE';  
  observations: string;                                             
  certification_number: string | null;
  result: 'passed' | 'conditional' | 'failed';
  next_inspection_date: string;
  certificate_url: string | null;
  assets: {
    id: string;
    name: string;
    serial_number: string;
    asset_categories: {
      name: string;
    } | null;
  };
}

interface Summary {
  total_inspections: number;
  passed: number;
  conditional: number;
  failed: number;
  without_certificate: number;
  compliance_rate: number;
}

interface DateRange {
  earliest_date: string | null;
  latest_date: string | null;
  total_inspections: number;
}

function VGPReportContent() {
  const { language } = useLanguage();
  const t = createTranslator(language);

  const [loadingDates, setLoadingDates] = useState(true);
  const [loadingInspections, setLoadingInspections] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [formData, setFormData] = useState({
    start_date: '',
    end_date: '',
  });

  useEffect(() => {
    fetchDateRange();
  }, []);

  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      fetchInspections();
    }
  }, [formData.start_date, formData.end_date]);

  const fetchDateRange = async () => {
    try {
      const res = await fetch('/api/vgp/report');
      if (!res.ok) throw new Error(t('vgpReport.errors.exportFailed'));

      const data = await res.json();
      setDateRange(data);

      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 3);
      
      setFormData({
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0],
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingDates(false);
    }
  };

  const fetchInspections = async () => {
    if (!formData.start_date || !formData.end_date) return;

    setLoadingInspections(true);
    setError('');
    setCurrentPage(1);

    try {
      const res = await fetch(
        `/api/vgp/report?start_date=${formData.start_date}&end_date=${formData.end_date}`
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || t('vgpReport.errors.exportFailed'));
      }

      const data = await res.json();
      setInspections(data.inspections || []);
      
      const total = data.inspections?.length || 0;
      const passed = data.inspections?.filter((i: Inspection) => i.result === 'passed').length || 0;
      const conditional = data.inspections?.filter((i: Inspection) => i.result === 'conditional').length || 0;
      const failed = data.inspections?.filter((i: Inspection) => i.result === 'failed').length || 0;
      const withoutCert = data.inspections?.filter((i: Inspection) => !i.certificate_url).length || 0;
      const rate = total > 0 ? Math.round((passed / total) * 100) : 0;

      setSummary({
        total_inspections: total,
        passed,
        conditional,
        failed,
        without_certificate: withoutCert,
        compliance_rate: rate
      });
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.message);
      setInspections([]);
      setSummary(null);
    } finally {
      setLoadingInspections(false);
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.start_date || !formData.end_date) {
      setError(t('vgpReport.errors.selectDates'));
      return;
    }

    if (summary && summary.without_certificate > 0) {
      const warningMsg = language === 'fr' 
        ? `ATTENTION: ${summary.without_certificate} inspection(s) sans certificat seront incluses dans le rapport.\n\nContinuer quand même?`
        : `WARNING: ${summary.without_certificate} inspection(s) without certificate will be included in the report.\n\nContinue anyway?`;
      
      const confirmed = window.confirm(warningMsg);
      if (!confirmed) return;
    }

    setGenerating(true);
    setError('');
    setSuccess(false);

    try {
      const res = await fetch('/api/vgp/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || t('vgpReport.errors.exportFailed'));
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport-vgp-direccte-${formData.start_date}-${formData.end_date}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      console.error('Report generation error:', err);
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleExportCSV = () => {
    if (inspections.length === 0) return;

    setExportingCSV(true);

    try {
      const headers = language === 'fr' ? [
        'Date Inspection',
        'Équipement',
        'Numéro de Série',
        'Catégorie',
        'Inspecteur',
        'Organisme',
        'N° Certificat',
        'Résultat',
        'Prochaine Inspection',
        'Certificat Présent'
      ] : [
        'Inspection Date',
        'Equipment',
        'Serial Number',
        'Category',
        'Inspector',
        'Company',
        'Certificate No.',
        'Result',
        'Next Inspection',
        'Certificate Present'
      ];

      const rows = inspections.map(i => [
        i.inspection_date,
        i.assets?.name || '',
        i.assets?.serial_number || '',
        i.assets?.asset_categories?.name || '',
        i.inspector_name,
        i.inspector_company,
        i.certification_number || '',
        i.result === 'passed' 
          ? t('vgpReport.compliant')
          : i.result === 'conditional' 
          ? t('vgpReport.conditional') 
          : t('vgpReport.nonCompliant'),
        i.next_inspection_date,
        i.certificate_url ? t('vgpReport.yes') : t('vgpReport.no')
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vgp-inspections-${formData.start_date}-${formData.end_date}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('CSV export error:', err);
      setError(t('vgpReport.errors.exportFailed'));
    } finally {
      setExportingCSV(false);
    }
  };

  const handleQuickPeriod = (period: 'month' | 'quarter' | 'year' | 'all') => {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    let startDate = '';

    switch (period) {
      case 'month':
        const lastMonth = new Date(today);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        startDate = lastMonth.toISOString().split('T')[0];
        break;
      case 'quarter':
        const lastQuarter = new Date(today);
        lastQuarter.setMonth(lastQuarter.getMonth() - 3);
        startDate = lastQuarter.toISOString().split('T')[0];
        break;
      case 'year':
        const lastYear = new Date(today);
        lastYear.setFullYear(lastYear.getFullYear() - 1);
        startDate = lastYear.toISOString().split('T')[0];
        break;
      case 'all':
        if (dateRange?.earliest_date) {
          startDate = dateRange.earliest_date;
        }
        break;
    }

    setFormData({ start_date: startDate, end_date: endDate });
  };

  const getResultBadge = (result: string) => {
    const badges = {
      passed: {
        icon: <CheckCircle className="w-4 h-4" />,
        text: t('vgpReport.compliant'),
        class: 'bg-green-100 text-green-800 border-green-200'
      },
      conditional: {
        icon: <AlertTriangle className="w-4 h-4" />,
        text: t('vgpReport.conditional'),
        class: 'bg-yellow-100 text-yellow-800 border-yellow-200'
      },
      failed: {
        icon: <XCircle className="w-4 h-4" />,
        text: t('vgpReport.nonCompliant'),
        class: 'bg-red-100 text-red-800 border-red-200'
      }
    };

    const badge = badges[result as keyof typeof badges] || badges.passed;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${badge.class}`}>
        {badge.icon}
        {badge.text}
      </span>
    );
  };

  const paginatedInspections = inspections.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(inspections.length / itemsPerPage);

  if (loadingDates) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">{t('vgpReport.pageTitle')}</h1>
        </div>
        <p className="text-gray-600">
          {t('vgpReport.pageSubtitle')}
        </p>
      </div>

      {/* Date Selection */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">{t('vgpReport.reportPeriod')}</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            {t('vgpReport.quickPeriods')}
          </label>
          <div className="grid grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => handleQuickPeriod('month')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              {t('vgpReport.lastMonth')}
            </button>
            <button
              type="button"
              onClick={() => handleQuickPeriod('quarter')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              {t('vgpReport.lastQuarter')}
            </button>
            <button
              type="button"
              onClick={() => handleQuickPeriod('year')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              {t('vgpReport.lastYear')}
            </button>
            <button
              type="button"
              onClick={() => handleQuickPeriod('all')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              {t('vgpReport.allData')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('vgpReport.startDate')}
            </label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('vgpReport.endDate')}
            </label>
            <input
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <p className="text-sm text-gray-600 mb-1">{t('vgpReport.total')}</p>
            <p className="text-3xl font-bold text-gray-900">{summary.total_inspections}</p>
          </div>

          <div className="bg-green-50 rounded-lg shadow-md p-6 border border-green-200">
            <p className="text-sm text-green-700 mb-1">{t('vgpReport.compliant')}</p>
            <p className="text-3xl font-bold text-green-900">{summary.passed}</p>
          </div>

          <div className="bg-yellow-50 rounded-lg shadow-md p-6 border border-yellow-200">
            <p className="text-sm text-yellow-700 mb-1">{t('vgpReport.conditional')}</p>
            <p className="text-3xl font-bold text-yellow-900">{summary.conditional}</p>
          </div>

          <div className="bg-red-50 rounded-lg shadow-md p-6 border border-red-200">
            <p className="text-sm text-red-700 mb-1">{t('vgpReport.nonCompliant')}</p>
            <p className="text-3xl font-bold text-red-900">{summary.failed}</p>
          </div>

          <div className="bg-orange-50 rounded-lg shadow-md p-6 border border-orange-200">
            <p className="text-sm text-orange-700 mb-1">{t('vgpReport.noCertificate')}</p>
            <p className="text-3xl font-bold text-orange-900">{summary.without_certificate}</p>
          </div>

          <div className="bg-blue-50 rounded-lg shadow-md p-6 border border-blue-200">
            <p className="text-sm text-blue-700 mb-1">{t('vgpReport.compliance')}</p>
            <p className="text-3xl font-bold text-blue-900">{summary.compliance_rate}%</p>
          </div>
        </div>
      )}

      {/* Warning for missing certificates */}
      {summary && summary.without_certificate > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-orange-900 font-semibold">
                {language === 'fr' 
                  ? `Attention: ${summary.without_certificate} inspection(s) sans certificat`
                  : `Warning: ${summary.without_certificate} inspection(s) without certificate`}
              </p>
              <p className="text-sm text-orange-800 mt-1">
                {language === 'fr'
                  ? "Ces inspections seront incluses dans le rapport PDF mais n'ont pas de certificat associé. Vérifiez les données avant envoi aux autorités."
                  : "These inspections will be included in the PDF report but have no associated certificate. Verify data before submitting to authorities."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Data Preview Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('vgpReport.previewData')}
            {loadingInspections && (
              <span className="ml-2 text-sm font-normal text-gray-600">
                {t('vgpReport.loadingInspections')}
              </span>
            )}
            {!loadingInspections && inspections.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-600">
                ({inspections.length} {inspections.length > 1 ? t('vgpReport.inspections') : t('vgpReport.inspection')})
              </span>
            )}
          </h2>
          
          {inspections.length > 0 && (
            <button
              onClick={handleExportCSV}
              disabled={exportingCSV}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exportingCSV ? t('vgpReport.downloading') : t('vgpReport.exportCSV')}
            </button>
          )}
        </div>

        {loadingInspections ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">{t('vgpReport.loadingInspections')}</p>
          </div>
        ) : inspections.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">{t('vgpReport.noInspections')}</p>
            <p className="text-sm text-gray-500 mt-2">{t('vgpReport.modifyDates')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('vgpReport.equipment')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('vgpInspections.category')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('vgpReport.date')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('vgpReport.inspector')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('vgpReport.certificate')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('vgpReport.result')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('vgpReport.nextInspection')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedInspections.map((inspection) => (
                    <tr key={inspection.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {inspection.assets?.name || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {inspection.assets?.serial_number || (language === 'fr' ? 'Sans N/S' : 'No S/N')}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {inspection.assets?.asset_categories?.name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(inspection.inspection_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {inspection.inspector_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {inspection.inspector_company}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {inspection.certificate_url ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {t('vgpReport.yes')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                            <XCircle className="w-3 h-3 mr-1" />
                            {t('vgpReport.no')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getResultBadge(inspection.result)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(inspection.next_inspection_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                <p className="text-sm text-gray-700">
                  {language === 'fr'
                    ? `Affichage ${(currentPage - 1) * itemsPerPage + 1} à ${Math.min(currentPage * itemsPerPage, inspections.length)} sur ${inspections.length} inspections`
                    : `Showing ${(currentPage - 1) * itemsPerPage + 1} to ${Math.min(currentPage * itemsPerPage, inspections.length)} of ${inspections.length} inspections`}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('vgpReport.previous')}
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('vgpReport.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Generate Buttons */}
      <div className="bg-white rounded-lg shadow-md p-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-green-800">{t('vgpReport.success.downloaded')}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV || inspections.length === 0}
            className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-5 h-5" />
            {exportingCSV ? t('vgpReport.downloading') : t('vgpReport.downloadCSV')}
          </button>

          <button
            onClick={handleGenerateReport}
            disabled={generating || inspections.length === 0}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                {t('vgpReport.generating')}
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                {t('vgpReport.generatePDF')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* What's Included Section */}
      <div className="mt-6 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">{t('vgpReport.reportContents')}</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>{t('vgpReport.companyInfo')}</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>{t('vgpReport.compliancySummary')}</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>{t('vgpReport.detailedList')}</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>{t('vgpReport.certificateNumbers')}</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>{t('vgpReport.professionalFormat')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function VGPReportPage() {
  return (
    <FeatureGate feature="vgp_compliance">
      <VGPReportContent />
    </FeatureGate>
  );
}