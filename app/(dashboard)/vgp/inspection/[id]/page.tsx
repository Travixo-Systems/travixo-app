'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Save, CheckCircle, X, Upload, FileText } from 'lucide-react';
import { useUploadThing } from '@/lib/uploadthing';
import FeatureGate from '@/components/subscription/FeatureGate';
import { VGPReadOnlyBanner } from '@/components/vgp/VGPUpgradeOverlay';
import { useVGPAccess } from '@/hooks/useSubscription';

interface Schedule {
  id: string;
  asset_id: string;
  interval_months: number;
  last_inspection_date: string | null;
  next_due_date: string;
  assets: {
    id: string;
    name: string;
    serial_number: string;
    current_location: string;
    asset_categories: {
      name: string;
    } | null;
  };
}

export default function InspectionRecorderPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const scheduleId = resolvedParams.id;
  const { access: vgpAccess } = useVGPAccess();
  const isReadOnly = vgpAccess === 'read_only';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { startUpload, isUploading } = useUploadThing('vgpCertificate', {
    onClientUploadComplete: (res) => console.log('Upload completed:', res),
    onUploadError: (error: Error) => {
      console.error('Upload error:', error);
      setError(`Erreur de téléchargement: ${error.message}`);
    },
    onUploadProgress: (progress) => setUploadProgress(progress),
  });

  const [formData, setFormData] = useState({
    inspection_date: new Date().toISOString().split('T')[0],
    inspector_name: '',
    inspector_company: '',
    certification_number: '',
    result: 'passed' as 'passed' | 'conditional' | 'failed',
    findings: '',
  });

  useEffect(() => {
    fetchSchedule();
  }, [scheduleId]);

  const fetchSchedule = async () => {
    try {
      const res = await fetch(`/api/vgp/schedules/${scheduleId}`);
      if (!res.ok) throw new Error('Échec du chargement du calendrier');
      const data = await res.json();
      setSchedule(data.schedule);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Seuls les fichiers PDF sont acceptés');
      return;
    }
    const maxSize = 4 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Le fichier est trop volumineux (max 4 MB)');
      return;
    }
    setSelectedFile(file);
    setError('');
  };

  const removeFile = () => {
    setSelectedFile(null);
    setUploadProgress(0);
  };

  const calculateNextInspectionDate = (result: string, intervalMonths: number): string => {
    const today = new Date();
    let nextDate: Date;
    if (result === 'failed') nextDate = new Date(today.setDate(today.getDate() + 30));
    else if (result === 'conditional') nextDate = new Date(today.setMonth(today.getMonth() + 6));
    else nextDate = new Date(today.setMonth(today.getMonth() + intervalMonths));
    return nextDate.toISOString().split('T')[0];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.inspector_name || !formData.inspector_company) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }
    if (!selectedFile) {
      setError(
        "Le certificat VGP est obligatoire pour la conformité DIRECCTE.\n\n" +
          "Sans certificat officiel, l'inspection n'est pas conforme à la réglementation " +
          "française (Article R4323-23) et votre équipement reste exposé aux amendes."
      );
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let certificateUrl: string | null = null;
      let certificateFileName: string | null = null;

      if (selectedFile) {
        const uploadResult = await startUpload([selectedFile]);
        if (!uploadResult || uploadResult.length === 0) {
          throw new Error('Échec du téléchargement du certificat');
        }
        certificateUrl = uploadResult[0].ufsUrl;
        certificateFileName = uploadResult[0].name;
      }

      const next_inspection_date = calculateNextInspectionDate(
        formData.result,
        schedule!.interval_months
      );

      const payload = {
        asset_id: schedule!.asset_id,
        schedule_id: schedule!.id,
        inspection_date: formData.inspection_date,
        inspector_name: formData.inspector_name,
        inspector_company: formData.inspector_company,
        certification_number: formData.certification_number || null,
        result: formData.result,
        findings: formData.findings || null,
        interval_months: schedule!.interval_months,
        next_inspection_date,
        certificate_url: certificateUrl,
        certificate_file_name: certificateFileName,
      };

      const res = await fetch('/api/vgp/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || "Échec de l'enregistrement");
      router.push('/vgp');
    } catch (err: any) {
      console.error('Inspection submission error:', err);
      setError(err.message);
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  if (loading) {
    return (
      <FeatureGate feature="vgp_compliance">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Chargement...</p>
          </div>
        </div>
      </FeatureGate>
    );
  }

  if (error && !schedule) {
    return (
      <FeatureGate feature="vgp_compliance">
        <div className="p-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      </FeatureGate>
    );
  }

  if (isReadOnly) {
    return (
      <FeatureGate feature="vgp_compliance">
        <div className="p-8 max-w-4xl mx-auto">
          <VGPReadOnlyBanner />
          <div className="mt-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Enregistrer une Inspection VGP</h1>
            <p className="text-gray-600">
              L'enregistrement d'inspections n'est pas disponible en mode lecture seule.
              Passez au plan Professionnel pour enregistrer de nouvelles inspections.
            </p>
            <button
              onClick={() => router.push('/vgp')}
              className="mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
            >
              Retour au tableau VGP
            </button>
          </div>
        </div>
      </FeatureGate>
    );
  }

  return (
    <FeatureGate feature="vgp_compliance">
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Enregistrer une Inspection VGP</h1>
          <p className="text-gray-600 mt-2">
            Enregistrement de l'inspection pour {schedule?.assets?.name}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Informations sur l'Équipement</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Équipement</p>
              <p className="font-semibold">{schedule?.assets?.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Numéro de Série</p>
              <p className="font-semibold">{schedule?.assets?.serial_number || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Catégorie</p>
              <p className="font-semibold">
                {schedule?.assets?.asset_categories?.name || 'Non catégorisé'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Localisation</p>
              <p className="font-semibold">{schedule?.assets?.current_location || 'N/A'}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-6">Détails de l'Inspection</h2>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date d'Inspection <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.inspection_date}
                onChange={(e) => setFormData({ ...formData, inspection_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom de l'Inspecteur <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.inspector_name}
                onChange={(e) => setFormData({ ...formData, inspector_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Jean Dupont"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Organisme de Contrôle <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.inspector_company}
                onChange={(e) => setFormData({ ...formData, inspector_company: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Bureau Veritas, DEKRA, Apave..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Numéro de Certificat
              </label>
              <input
                type="text"
                value={formData.certification_number}
                onChange={(e) =>
                  setFormData({ ...formData, certification_number: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="VGP-2025-12345"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Résultat de l'Inspection <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, result: 'passed' })}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  formData.result === 'passed'
                    ? 'border-green-500 bg-green-50 text-green-900'
                    : 'border-gray-300 hover:border-green-300'
                }`}
              >
                <div className="text-center">
                  <p className="font-semibold">✓ Conforme</p>
                  <p className="text-sm mt-1">Prochaine inspection : selon l'intervalle</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, result: 'conditional' })}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  formData.result === 'conditional'
                    ? 'border-yellow-500 bg-yellow-50 text-yellow-900'
                    : 'border-gray-300 hover:border-yellow-300'
                }`}
              >
                <div className="text-center">
                  <p className="font-semibold">⚠ Conditionnel</p>
                  <p className="text-sm mt-1">Prochaine inspection : 6 mois</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, result: 'failed' })}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  formData.result === 'failed'
                    ? 'border-red-500 bg-red-50 text-red-900'
                    : 'border-gray-300 hover:border-red-300'
                }`}
              >
                <div className="text-center">
                  <p className="font-semibold">✗ Non Conforme</p>
                  <p className="text-sm mt-1">Équipement hors service - Réinspection : 30 jours</p>
                </div>
              </button>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Constatations / Remarques
            </label>
            <textarea
              value={formData.findings}
              onChange={(e) => setFormData({ ...formData, findings: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Observations, anomalies détectées, recommandations..."
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Certificat VGP (PDF) <span className="text-red-500">*</span>
            </label>

            {selectedFile ? (
              <div className="border-2 border-green-300 bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-green-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-green-900">{selectedFile.name}</p>
                    <p className="text-sm text-green-700">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    disabled={submitting}
                    className="text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                <label htmlFor="certificate-upload" className="cursor-pointer">
                  <span className="text-blue-600 hover:text-blue-700 font-medium">
                    Choisir un fichier
                  </span>
                  <span className="text-gray-600"> ou glissez-déposez</span>
                  <input
                    id="certificate-upload"
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={submitting}
                  />
                </label>
                <p className="text-sm text-gray-500 mt-2">PDF uniquement, maximum 4 MB</p>
              </div>
            )}

            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">Téléchargement...</span>
                  <span className="text-sm font-medium text-blue-600">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <p className="text-sm text-gray-600 mt-2">
              <strong className="text-red-600">Obligatoire:</strong> Le certificat VGP est exigé
              par DIRECCTE. Sans certificat officiel de l'organisme de contrôle, l'inspection
              n'est pas conforme et votre équipement reste exposé aux amendes (€3K–€15K par
              violation).
            </p>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.push('/vgp')}
              disabled={submitting}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || isUploading}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  {uploadProgress > 0 && uploadProgress < 100
                    ? `Téléchargement... ${uploadProgress}%`
                    : 'Enregistrement...'}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Enregistrer l'Inspection
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </FeatureGate>
  );
}
