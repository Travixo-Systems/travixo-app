'use client';

import { useEffect, useState } from 'react';
import { FileText, Download, Calendar, AlertCircle, CheckCircle, XCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import FeatureGate from '@/components/subscription/FeatureGate';

interface Inspection {
  id: string;
  inspection_date: string;
  inspector_name: string;
  inspector_company: string;
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
      if (!res.ok) throw new Error('Échec du chargement des données');

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
        throw new Error(errorData.error || 'Erreur lors du chargement');
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
      setError('Veuillez sélectionner les dates de début et de fin');
      return;
    }

    if (summary && summary.without_certificate > 0) {
      const confirmed = window.confirm(
        `ATTENTION: ${summary.without_certificate} inspection(s) sans certificat seront incluses dans le rapport.\n\nContinuer quand même?`
      );
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
        throw new Error(errorData.error || 'Erreur lors de la génération du rapport');
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
      const headers = [
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
      ];

      const rows = inspections.map(i => [
        i.inspection_date,
        i.assets?.name || '',
        i.assets?.serial_number || '',
        i.assets?.asset_categories?.name || '',
        i.inspector_name,
        i.inspector_company,
        i.certification_number || '',
        i.result === 'passed' ? 'Conforme' : i.result === 'conditional' ? 'Conditionnel' : 'Non conforme',
        i.next_inspection_date,
        i.certificate_url ? 'Oui' : 'Non'
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
      setError('Erreur lors de l\'export CSV');
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
        text: 'Conforme',
        class: 'bg-green-100 text-green-800 border-green-200'
      },
      conditional: {
        icon: <AlertTriangle className="w-4 h-4" />,
        text: 'Conditionnel',
        class: 'bg-yellow-100 text-yellow-800 border-yellow-200'
      },
      failed: {
        icon: <XCircle className="w-4 h-4" />,
        text: 'Non conforme',
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
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Rapport VGP DIRECCTE</h1>
        </div>
        <p className="text-gray-600">
          Vérifiez les données avant génération du rapport officiel
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Période du Rapport</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Périodes Rapides
          </label>
          <div className="grid grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => handleQuickPeriod('month')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              Dernier Mois
            </button>
            <button
              type="button"
              onClick={() => handleQuickPeriod('quarter')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              Dernier Trimestre
            </button>
            <button
              type="button"
              onClick={() => handleQuickPeriod('year')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              Dernière Année
            </button>
            <button
              type="button"
              onClick={() => handleQuickPeriod('all')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              Toutes les Données
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date de Début
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
              Date de Fin
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

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <p className="text-sm text-gray-600 mb-1">Total</p>
            <p className="text-3xl font-bold text-gray-900">{summary.total_inspections}</p>
          </div>

          <div className="bg-green-50 rounded-lg shadow-md p-6 border border-green-200">
            <p className="text-sm text-green-700 mb-1">Conformes</p>
            <p className="text-3xl font-bold text-green-900">{summary.passed}</p>
          </div>

          <div className="bg-yellow-50 rounded-lg shadow-md p-6 border border-yellow-200">
            <p className="text-sm text-yellow-700 mb-1">Conditionnels</p>
            <p className="text-3xl font-bold text-yellow-900">{summary.conditional}</p>
          </div>

          <div className="bg-red-50 rounded-lg shadow-md p-6 border border-red-200">
            <p className="text-sm text-red-700 mb-1">Non Conformes</p>
            <p className="text-3xl font-bold text-red-900">{summary.failed}</p>
          </div>

          <div className="bg-orange-50 rounded-lg shadow-md p-6 border border-orange-200">
            <p className="text-sm text-orange-700 mb-1">Sans Certificat</p>
            <p className="text-3xl font-bold text-orange-900">{summary.without_certificate}</p>
          </div>

          <div className="bg-blue-50 rounded-lg shadow-md p-6 border border-blue-200">
            <p className="text-sm text-blue-700 mb-1">Conformité</p>
            <p className="text-3xl font-bold text-blue-900">{summary.compliance_rate}%</p>
          </div>
        </div>
      )}

      {summary && summary.without_certificate > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-orange-900 font-semibold">
                Attention: {summary.without_certificate} inspection(s) sans certificat
              </p>
              <p className="text-sm text-orange-800 mt-1">
                Ces inspections seront incluses dans le rapport PDF mais n'ont pas de certificat associé. 
                Vérifiez les données avant envoi aux autorités.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">
            Prévisualisation des Données
            {loadingInspections && (
              <span className="ml-2 text-sm font-normal text-gray-600">
                Chargement...
              </span>
            )}
            {!loadingInspections && inspections.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-600">
                ({inspections.length} inspection{inspections.length > 1 ? 's' : ''})
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
              {exportingCSV ? 'Export...' : 'Export CSV'}
            </button>
          )}
        </div>

        {loadingInspections ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Chargement des inspections...</p>
          </div>
        ) : inspections.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Aucune inspection trouvée pour cette période</p>
            <p className="text-sm text-gray-500 mt-2">Modifiez les dates ou ajoutez des inspections VGP</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Équipement
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Catégorie
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Inspecteur
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Certificat
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Résultat
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Prochaine
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
                            {inspection.assets?.serial_number || 'Sans N/S'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {inspection.assets?.asset_categories?.name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(inspection.inspection_date).toLocaleDateString('fr-FR')}
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
                            Oui
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                            <XCircle className="w-3 h-3 mr-1" />
                            Non
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getResultBadge(inspection.result)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(inspection.next_inspection_date).toLocaleDateString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                <p className="text-sm text-gray-700">
                  Affichage {(currentPage - 1) * itemsPerPage + 1} à {Math.min(currentPage * itemsPerPage, inspections.length)} sur {inspections.length} inspections
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Précédent
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

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
            <p className="text-green-800">Rapport généré et téléchargé avec succès</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV || inspections.length === 0}
            className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-green-600 text-green-600 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-5 h-5" />
            {exportingCSV ? 'Export en cours...' : 'Télécharger CSV (Données Brutes)'}
          </button>

          <button
            onClick={handleGenerateReport}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Génération en cours...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Générer Rapport PDF (Officiel)
              </>
            )}
          </button>
        </div>
      </div>

      {/* What's Included Section */}
      <div className="mt-6 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Contenu du Rapport</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>Informations de l'entreprise (nom, adresse, SIRET)</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>Résumé de conformité avec statistiques</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>Liste détaillée de toutes les inspections (équipement, inspecteur, résultat)</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>Numéros de certificat et dates de prochaines inspections</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>Format professionnel conforme DIRECCTE</span>
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