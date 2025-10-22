// app/(dashboard)/vgp/inspection/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, Upload, FileText } from 'lucide-react';

interface InspectionRecorderProps {
  params: { id: string };
}

export default function InspectionRecorder({ params }: InspectionRecorderProps) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [schedule, setSchedule] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  
  const [formData, setFormData] = useState({
    inspection_date: new Date().toISOString().split('T')[0],
    inspector_name: '',
    inspector_company: '',
    certification_number: '',
    result: 'passed' as 'passed' | 'conditional' | 'failed',
    findings: '',
  });

  useEffect(() => {
    loadSchedule();
  }, [params.id]);

  const loadSchedule = async () => {
    try {
      const res = await fetch(`/api/vgp/schedules/${params.id}`);
      if (!res.ok) throw new Error('Schedule not found');
      
      const data = await res.json();
      setSchedule(data.schedule);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        setError('Le certificat doit être au format PDF');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('Le fichier ne doit pas dépasser 5 MB');
        return;
      }
      setCertificateFile(file);
      setError(null);
    }
  };

  const uploadCertificate = async (): Promise<{ url: string; fileName: string } | null> => {
    if (!certificateFile) return null;

    try {
      const fileExt = certificateFile.name.split('.').pop();
      const fileName = `${params.id}-${Date.now()}.${fileExt}`;
      const filePath = `vgp-certificates/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('certificates')
        .upload(filePath, certificateFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('certificates')
        .getPublicUrl(filePath);

      return { url: publicUrl, fileName: certificateFile.name };
    } catch (err) {
      console.error('Certificate upload failed:', err);
      return null;
    }
  };

  const calculateNextDueDate = (inspectionDate: string, result: string): string => {
    const date = new Date(inspectionDate);
    
    switch (result) {
      case 'passed':
        date.setMonth(date.getMonth() + (schedule?.interval_months || 12));
        break;
      case 'conditional':
        date.setMonth(date.getMonth() + 6);
        break;
      case 'failed':
        date.setDate(date.getDate() + 30);
        break;
    }
    
    return date.toISOString().split('T')[0];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      let certificateData = null;
      if (certificateFile) {
        certificateData = await uploadCertificate();
      }

      const nextDueDate = calculateNextDueDate(formData.inspection_date, formData.result);

      const inspectionPayload = {
        asset_id: schedule.asset_id,
        schedule_id: params.id,
        inspection_date: formData.inspection_date,
        inspector_name: formData.inspector_name,
        inspector_company: formData.inspector_company,
        certification_number: formData.certification_number || null,
        result: formData.result,
        findings: formData.findings || null,
        next_inspection_date: nextDueDate,
        certificate_url: certificateData?.url || null,
        certificate_file_name: certificateData?.fileName || null,
      };

      const res = await fetch('/api/vgp/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inspectionPayload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to record inspection');
      }

      const updateSchedulePayload = {
        status: formData.result === 'failed' ? 'failed' : 'completed',
        last_inspection_date: formData.inspection_date,
        next_due_date: nextDueDate,
      };

      await fetch(`/api/vgp/schedules/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateSchedulePayload),
      });

      if (formData.result === 'failed') {
        await fetch(`/api/assets/${schedule.asset_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'out_of_service' }),
        });
      }

      router.push('/vgp');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !schedule) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <XCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-900 mb-2">Erreur</h2>
          <p className="text-red-700">{error}</p>
          <button
            onClick={() => router.push('/vgp')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <button
        onClick={() => router.push('/vgp')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour au tableau de bord VGP
      </button>

      <div className="bg-white rounded-lg shadow-lg">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Enregistrer Inspection VGP</h1>
          <p className="text-gray-600 mt-1">
            Renseigner les détails de l'inspection effectuée
          </p>
        </div>

        {schedule && (
          <div className="p-6 bg-blue-50 border-b border-blue-100">
            <h3 className="font-semibold text-blue-900">{schedule.assets?.name}</h3>
            <div className="flex items-center gap-4 mt-1 text-sm text-blue-700">
              {schedule.assets?.serial_number && (
                <span>N° Série: {schedule.assets.serial_number}</span>
              )}
              <span>
                Échéance: {new Date(schedule.next_due_date).toLocaleDateString('fr-FR')}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-6 bg-red-50 border-b border-red-100">
            <div className="flex items-center gap-2 text-red-800">
              <XCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date d'Inspection <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.inspection_date}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setFormData({ ...formData, inspection_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Jean Dupont"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: APAVE, Bureau Veritas, SOCOTEC"
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
              onChange={(e) => setFormData({ ...formData, certification_number: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: VGP-2025-12345"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Résultat de l'Inspection <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, result: 'passed' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.result === 'passed'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-300 hover:border-green-300'
                }`}
              >
                <CheckCircle className={`w-8 h-8 mx-auto mb-2 ${
                  formData.result === 'passed' ? 'text-green-600' : 'text-gray-400'
                }`} />
                <p className="font-semibold text-center">Conforme</p>
                <p className="text-xs text-gray-600 text-center mt-1">
                  Prochaine: {schedule?.interval_months || 12} mois
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, result: 'conditional' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.result === 'conditional'
                    ? 'border-yellow-500 bg-yellow-50'
                    : 'border-gray-300 hover:border-yellow-300'
                }`}
              >
                <AlertTriangle className={`w-8 h-8 mx-auto mb-2 ${
                  formData.result === 'conditional' ? 'text-yellow-600' : 'text-gray-400'
                }`} />
                <p className="font-semibold text-center">Conditionnel</p>
                <p className="text-xs text-gray-600 text-center mt-1">
                  Prochaine: 6 mois
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, result: 'failed' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.result === 'failed'
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-300 hover:border-red-300'
                }`}
              >
                <XCircle className={`w-8 h-8 mx-auto mb-2 ${
                  formData.result === 'failed' ? 'text-red-600' : 'text-gray-400'
                }`} />
                <p className="font-semibold text-center">Non Conforme</p>
                <p className="text-xs text-gray-600 text-center mt-1">
                  Ré-inspection: 30 jours
                </p>
              </button>
            </div>
          </div>

          {formData.result === 'failed' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-900 font-semibold">
                Attention: L'équipement sera marqué "Hors Service"
              </p>
              <p className="text-xs text-red-700 mt-1">
                Une ré-inspection devra être effectuée après réparations (planifiée dans 30 jours)
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Observations / Anomalies
            </label>
            <textarea
              value={formData.findings}
              onChange={(e) => setFormData({ ...formData, findings: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="Détails des anomalies, recommandations, observations..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Certificat VGP (PDF)
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
                id="certificate-upload"
              />
              <label htmlFor="certificate-upload" className="cursor-pointer">
                {certificateFile ? (
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <FileText className="w-6 h-6" />
                    <span className="font-medium">{certificateFile.name}</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600">
                      Cliquez pour télécharger le certificat (PDF, max 5 MB)
                    </p>
                  </>
                )}
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => router.push('/vgp')}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              disabled={submitting}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Enregistrement...' : 'Enregistrer Inspection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}