'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Save, CheckCircle, X, Upload, FileText } from 'lucide-react';
import { useUploadThing } from '@/lib/uploadthing';
import FeatureGate from '@/components/subscription/FeatureGate';
import { VGPReadOnlyBanner } from '@/components/vgp/VGPUpgradeOverlay';
import { useVGPAccess } from '@/hooks/useSubscription';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';

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
  const { language } = useLanguage();
  const t = createTranslator(language);

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
      setError(`${t('vgpInspection.errorUpload')} ${error.message}`);
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
      if (!res.ok) throw new Error(t('vgpInspection.errorLoadSchedule'));
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
      setError(t('vgpInspection.errorPdfOnly'));
      return;
    }
    const maxSize = 4 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(t('vgpInspection.errorFileTooLarge'));
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
      setError(t('vgpInspection.errorRequiredFields'));
      return;
    }
    if (!selectedFile) {
      setError(t('vgpInspection.errorCertRequired'));
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
          throw new Error(t('vgpInspection.errorUploadFailed'));
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
      if (!res.ok) throw new Error(responseData.error || t('vgpInspection.errorSubmitFailed'));
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
            <p className="mt-4 text-[var(--text-muted,#777)]">{t('vgpInspection.loading')}</p>
          </div>
        </div>
      </FeatureGate>
    );
  }

  if (error && !schedule) {
    return (
      <FeatureGate feature="vgp_compliance">
        <div className="p-3 md:p-6">
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
        <div className="p-3 md:p-6 max-w-4xl mx-auto">
          <VGPReadOnlyBanner />
          <div className="mt-4">
            <h1 className="text-2xl font-bold text-[var(--text-primary,#1a1a1a)] mb-2">{t('vgpInspection.readOnlyTitle')}</h1>
            <p className="text-[var(--text-muted,#777)]">
              {t('vgpInspection.readOnlyMessage')}
            </p>
            <button
              onClick={() => router.push('/vgp')}
              className="mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-[15px]"
            >
              {t('vgpInspection.backToVgp')}
            </button>
          </div>
        </div>
      </FeatureGate>
    );
  }

  return (
    <FeatureGate feature="vgp_compliance">
      <div className="p-3 md:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[var(--text-primary,#1a1a1a)]">{t('vgpInspection.pageTitle')}</h1>
          <p className="text-[var(--text-muted,#777)] mt-2">
            {t('vgpInspection.pageSubtitle')} {schedule?.assets?.name}
          </p>
        </div>

        <div className="bg-[var(--card-bg,#edeff2)] rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-[22px] font-semibold mb-4">{t('vgpInspection.equipmentInfo')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[15px] text-[var(--text-muted,#777)]">{t('vgpInspection.equipment')}</p>
              <p className="font-semibold">{schedule?.assets?.name}</p>
            </div>
            <div>
              <p className="text-[15px] text-[var(--text-muted,#777)]">{t('vgpInspection.serialNumber')}</p>
              <p className="font-semibold">{schedule?.assets?.serial_number || t('vgpInspection.notAvailable')}</p>
            </div>
            <div>
              <p className="text-[15px] text-[var(--text-muted,#777)]">{t('vgpInspection.category')}</p>
              <p className="font-semibold">
                {schedule?.assets?.asset_categories?.name || t('vgpInspection.uncategorized')}
              </p>
            </div>
            <div>
              <p className="text-[15px] text-[var(--text-muted,#777)]">{t('vgpInspection.location')}</p>
              <p className="font-semibold">{schedule?.assets?.current_location || t('vgpInspection.notAvailable')}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-[var(--card-bg,#edeff2)] rounded-lg shadow-md p-6">
          <h2 className="text-[22px] font-semibold mb-6">{t('vgpInspection.inspectionDetails')}</h2>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800 whitespace-pre-line">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-[15px] font-semibold text-[var(--text-secondary,#444)] mb-2">
                {t('vgpInspection.inspectionDate')} <span className="text-red-500">*</span>
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
              <label className="block text-[15px] font-semibold text-[var(--text-secondary,#444)] mb-2">
                {t('vgpInspection.inspectorName')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.inspector_name}
                onChange={(e) => setFormData({ ...formData, inspector_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('vgpInspection.inspectorNamePlaceholder')}
                required
              />
            </div>

            <div>
              <label className="block text-[15px] font-semibold text-[var(--text-secondary,#444)] mb-2">
                {t('vgpInspection.inspectionBody')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.inspector_company}
                onChange={(e) => setFormData({ ...formData, inspector_company: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('vgpInspection.inspectionBodyPlaceholder')}
                required
              />
            </div>

            <div>
              <label className="block text-[15px] font-semibold text-[var(--text-secondary,#444)] mb-2">
                {t('vgpInspection.certNumber')}
              </label>
              <input
                type="text"
                value={formData.certification_number}
                onChange={(e) =>
                  setFormData({ ...formData, certification_number: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('vgpInspection.certNumberPlaceholder')}
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-[15px] font-semibold text-[var(--text-secondary,#444)] mb-2">
              {t('vgpInspection.result')} <span className="text-red-500">*</span>
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
                  <p className="font-semibold">
                    <CheckCircle className="w-4 h-4 inline mr-1" />
                    {t('vgpInspection.resultPassed')}
                  </p>
                  <p className="text-[15px] mt-1">{t('vgpInspection.resultPassedDesc')}</p>
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
                  <p className="font-semibold">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    {t('vgpInspection.resultConditional')}
                  </p>
                  <p className="text-[15px] mt-1">{t('vgpInspection.resultConditionalDesc')}</p>
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
                  <p className="font-semibold">
                    <X className="w-4 h-4 inline mr-1" />
                    {t('vgpInspection.resultFailed')}
                  </p>
                  <p className="text-[15px] mt-1">{t('vgpInspection.resultFailedDesc')}</p>
                </div>
              </button>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-[15px] font-semibold text-[var(--text-secondary,#444)] mb-2">
              {t('vgpInspection.findings')}
            </label>
            <textarea
              value={formData.findings}
              onChange={(e) => setFormData({ ...formData, findings: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t('vgpInspection.findingsPlaceholder')}
            />
          </div>

          <div className="mb-6">
            <label className="block text-[15px] font-semibold text-[var(--text-secondary,#444)] mb-2">
              {t('vgpInspection.certificateLabel')} <span className="text-red-500">*</span>
            </label>

            {selectedFile ? (
              <div className="border-2 border-green-300 rounded-lg p-4" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-green-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-green-900">{selectedFile.name}</p>
                    <p className="text-[15px] text-green-700">
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
                <Upload className="w-12 h-12 mx-auto text-[var(--text-hint,#888)] mb-3" />
                <label htmlFor="certificate-upload" className="cursor-pointer">
                  <span className="text-blue-600 hover:text-blue-700 font-medium">
                    {t('vgpInspection.chooseFile')}
                  </span>
                  <span className="text-[var(--text-muted,#777)]"> {t('vgpInspection.orDragDrop')}</span>
                  <input
                    id="certificate-upload"
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={submitting}
                  />
                </label>
                <p className="text-[15px] text-[var(--text-hint,#888)] mt-2">{t('vgpInspection.pdfOnly')}</p>
              </div>
            )}

            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[15px] text-[var(--text-muted,#777)]">{t('vgpInspection.uploading')}</span>
                  <span className="text-[15px] font-medium text-blue-600">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <p className="text-[15px] text-[var(--text-muted,#777)] mt-2">
              {t('vgpInspection.certificateRequired')}
            </p>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.push('/vgp')}
              disabled={submitting}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('vgpInspection.cancel')}
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
                    ? `${t('vgpInspection.uploadingProgress')} ${uploadProgress}%`
                    : t('vgpInspection.submitting')}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {t('vgpInspection.submit')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </FeatureGate>
  );
}
