'use client'

import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, ArrowUpTrayIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

interface ImportAssetsModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

interface ImportPreview {
  valid: any[]
  invalid: any[]
  total: number
  detectedColumns: Record<string, string>
}

export default function ImportAssetsModal({ isOpen, onClose, onSuccess }: ImportAssetsModalProps) {
  const supabase = createClient()
  const { language } = useLanguage()
  const t = createTranslator(language)
  
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  // Helper to get translated status label for display
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available': return t('assets.statusAvailable')
      case 'in_use': return t('assets.statusInUse')
      case 'maintenance': return t('assets.statusMaintenance')
      case 'retired': return t('assets.statusRetired')
      default: return status
    }
  }

  const detectColumns = (firstRow: any): Record<string, string> => {
    const mapping: Record<string, string> = {}
    const keys = Object.keys(firstRow)

    keys.forEach(key => {
      const lower = key.toLowerCase().trim()

      if (!mapping.name && (lower.includes('name') || lower.includes('equipment') || lower.includes('item') || lower.includes('asset') || lower.includes('nom') || lower.includes('equipement')))
        mapping.name = key

      if (!mapping.serial_number && (lower.includes('serial') || lower.includes('sn') || lower.includes('s/n') || lower.includes('serie') || lower.includes('numéro')))
        mapping.serial_number = key

      if (!mapping.current_location && (lower.includes('location') || lower.includes('site') || lower.includes('depot') || lower.includes('warehouse') || lower.includes('emplacement') || lower.includes('entrepot')))
        mapping.current_location = key

      if (!mapping.status && (lower.includes('status') || lower.includes('state') || lower.includes('condition') || lower.includes('statut') || lower.includes('etat')))
        mapping.status = key

      if (!mapping.description && (lower.includes('description') || lower.includes('desc') || lower.includes('notes') || lower.includes('detail')))
        mapping.description = key

      if (!mapping.purchase_date && (lower.includes('purchase') && lower.includes('date') || lower.includes('acquired') || lower.includes('achat')))
        mapping.purchase_date = key

      if (!mapping.purchase_price && (lower.includes('cost') || lower.includes('price') || lower.includes('value') || lower.includes('prix') || lower.includes('cout') || lower.includes('valeur')))
        mapping.purchase_price = key
    })

    return mapping
  }

  const cleanAssetData = (row: any, mapping: Record<string, string>) => {
    const asset: any = {
      name: null,
      serial_number: null,
      description: null,
      current_location: null,
      status: 'available',
      purchase_date: null,
      purchase_price: null,
    }

    if (mapping.name && row[mapping.name]) {
      asset.name = row[mapping.name].toString().trim()
    }
    if (mapping.serial_number && row[mapping.serial_number]) {
      asset.serial_number = row[mapping.serial_number].toString().trim()
    }
    if (mapping.description && row[mapping.description]) {
      asset.description = row[mapping.description].toString().trim()
    }
    if (mapping.current_location && row[mapping.current_location]) {
      asset.current_location = row[mapping.current_location].toString().trim()
    }
    if (mapping.status && row[mapping.status]) {
      const statusStr = row[mapping.status].toString().toLowerCase().trim()
      if (statusStr.includes('avail') || statusStr.includes('dispo')) asset.status = 'available'
      else if (statusStr.includes('use') || statusStr.includes('deploy') || statusStr.includes('utilis')) asset.status = 'in_use'
      else if (statusStr.includes('main') || statusStr.includes('repair') || statusStr.includes('repar')) asset.status = 'maintenance'
      else if (statusStr.includes('retire') || statusStr.includes('decom') || statusStr.includes('retir')) asset.status = 'retired'
      else asset.status = 'available'
    }
    if (mapping.purchase_date && row[mapping.purchase_date]) {
      asset.purchase_date = row[mapping.purchase_date].toString().trim()
    }
    if (mapping.purchase_price && row[mapping.purchase_price]) {
      asset.purchase_price = parseFloat(row[mapping.purchase_price].toString().replace(/[^0-9.-]+/g, ''))
    }

    if (!asset.name || asset.name === '') {
      throw new Error(t('assets.errorNameRequired'))
    }

    return asset
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setPreview(null)
    }
  }

  const processFile = async () => {
    if (!file) return

    setIsProcessing(true)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet)

      if (data.length === 0) {
        throw new Error(t('assets.errorFileEmpty'))
      }

      const mapping = detectColumns(data[0])
      const valid: any[] = []
      const invalid: any[] = []

      data.forEach((row) => {
        try {
          const cleaned = cleanAssetData(row, mapping)
          valid.push(cleaned)
        } catch (error) {
          invalid.push({ row, error: error instanceof Error ? error.message : t('assets.errorInvalidData') })
        }
      })

      setPreview({
        valid,
        invalid,
        total: data.length,
        detectedColumns: mapping
      })

    } catch (error) {
      console.error('Error processing file:', error)
      toast.error(error instanceof Error ? error.message : t('assets.errorProcessFailed'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImport = async () => {
    if (!preview || preview.valid.length === 0) return

    setIsImporting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error(t('assets.errorNotAuthenticated'))

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!userData?.organization_id) {
        throw new Error(t('assets.errorNoOrganization'))
      }

      const assetsToInsert = preview.valid.map(asset => {
        const qrCode = uuidv4()
        return {
          ...asset,
          organization_id: userData.organization_id,
          qr_code: qrCode,
          qr_url: `${window.location.origin}/scan/${qrCode}`,
        }
      })

      const { error } = await supabase
        .from('assets')
        .insert(assetsToInsert)

      if (error) throw error

      toast.success(`${preview.valid.length} ${t('assets.toastImportSuccess')}`)
      onSuccess?.()
      resetModal()
    } catch (error) {
      console.error('Error importing assets:', error)
      toast.error(error instanceof Error ? error.message : t('assets.errorImportFailed'))
    } finally {
      setIsImporting(false)
    }
  }

  const resetModal = () => {
    setFile(null)
    setPreview(null)
    onClose()
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={resetModal}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-[720px] transform overflow-hidden rounded-xl p-6 transition-all" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
                <div className="flex justify-between items-center mb-4">
                  <Dialog.Title className="text-lg font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                    {t('assets.importTitle')}
                  </Dialog.Title>
                  <button onClick={resetModal} className="transition-colors" style={{ color: 'var(--text-muted, #777)' }} onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary, #1a1a1a)' }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {!preview ? (
                  <>
                    <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-[#e8600a] transition-colors" style={{ borderColor: '#b8b8b8' }}>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileChange}
                        className="hidden"
                        id="file-upload"
                      />
                      <label htmlFor="file-upload" className="cursor-pointer">
                        <ArrowUpTrayIcon className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-hint, #888)' }} />
                        <p className="text-lg mb-2">
                          {file ? file.name : t('assets.importDropzone')}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--text-muted, #777)' }}>
                          {t('assets.importSupportedFormats')}
                        </p>
                      </label>
                    </div>

                    {file && (
                      <button
                        onClick={processFile}
                        disabled={isProcessing}
                        className="w-full mt-6 text-white py-3 rounded-md font-semibold hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: 'var(--accent, #e8600a)' }}
                      >
                        {isProcessing ? t('assets.importProcessing') : t('assets.importPreview')}
                      </button>
                    )}

                    <div className="mt-6 rounded-lg p-4" style={{ backgroundColor: 'rgba(5,150,105,0.08)', borderLeft: '3px solid var(--status-conforme, #059669)' }}>
                      <h3 className="font-medium mb-2 text-[13px]" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('assets.importSmartDetection')}</h3>
                      <p className="text-[13px]" style={{ color: 'var(--text-muted, #777)' }}>
                        {t('assets.importSmartDetectionDesc')}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-6">
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--page-bg, #f6f8fd)', borderLeft: '3px solid var(--status-conforme, #059669)' }}>
                          <div className="flex items-center gap-2">
                            <CheckCircleIcon className="h-6 w-6" style={{ color: 'var(--status-conforme, #059669)' }} />
                            <div>
                              <p className="text-2xl font-medium" style={{ color: 'var(--status-conforme, #059669)' }}>{preview.valid.length}</p>
                              <p className="text-xs font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('assets.importValidRows')}</p>
                            </div>
                          </div>
                        </div>

                        {preview.invalid.length > 0 && (
                          <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--page-bg, #f6f8fd)', borderLeft: '3px solid var(--status-retard, #dc2626)' }}>
                            <div className="flex items-center gap-2">
                              <ExclamationCircleIcon className="h-6 w-6" style={{ color: 'var(--status-retard, #dc2626)' }} />
                              <div>
                                <p className="text-2xl font-medium" style={{ color: 'var(--status-retard, #dc2626)' }}>{preview.invalid.length}</p>
                                <p className="text-xs font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('assets.importInvalidRows')}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--page-bg, #f6f8fd)', borderLeft: '3px solid var(--status-neutral, #6b7280)' }}>
                          <div>
                            <p className="text-2xl font-medium" style={{ color: 'var(--status-neutral, #6b7280)' }}>{preview.total}</p>
                            <p className="text-xs font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('assets.importTotalRows')}</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--page-bg, #f6f8fd)' }}>
                        <h4 className="font-medium text-[13px] mb-2" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('assets.importDetectedColumns')}</h4>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(preview.detectedColumns).map(([key, value]) => (
                            <span key={key} className="px-3 py-1 rounded-full text-xs" style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-secondary, #444)' }}>
                              {value} &rarr; {key}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto rounded-lg" style={{ backgroundColor: 'var(--page-bg, #f6f8fd)' }}>
                      <table className="min-w-full">
                        <thead className="sticky top-0" style={{ backgroundColor: 'var(--page-bg, #f6f8fd)' }}>
                          <tr>
                            <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888)' }}>{t('assets.tableHeaderName')}</th>
                            <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888)' }}>{t('assets.tableHeaderSerial')}</th>
                            <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888)' }}>{t('assets.tableHeaderLocation')}</th>
                            <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888)' }}>{t('assets.tableHeaderStatus')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: '#dcdee3' }}>
                          {preview.valid.slice(0, 10).map((row, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-2 text-[13px] font-medium" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{row.name}</td>
                              <td className="px-4 py-2 text-[13px]" style={{ color: 'var(--text-secondary, #444)' }}>{row.serial_number || '-'}</td>
                              <td className="px-4 py-2 text-[13px]" style={{ color: 'var(--text-secondary, #444)' }}>{row.current_location || '-'}</td>
                              <td className="px-4 py-2 text-[13px]">
                                <span className={`font-medium ${
                                  row.status === 'available' ? 'text-[#059669]' :
                                  row.status === 'in_use' ? 'text-[#444]' :
                                  row.status === 'maintenance' ? 'text-[#d97706]' :
                                  'text-[#dc2626]'
                                }`}>
                                  {getStatusLabel(row.status)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-end space-x-3 mt-6">
                      <button
                        onClick={() => {
                          setFile(null)
                          setPreview(null)
                        }}
                        className="px-4 py-2 text-sm font-medium rounded-md transition-colors" style={{ color: 'var(--text-muted, #777)' }}
                      >
                        {t('assets.importChooseDifferent')}
                      </button>
                      <button
                        onClick={handleImport}
                        disabled={isImporting || preview.valid.length === 0}
                        className="px-6 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{ backgroundColor: 'var(--accent, #e8600a)' }}
                      >
                        {isImporting ? t('assets.importImporting') : `${t('assets.importCount')} ${preview.valid.length} ${t('assets.importEquipmentUnit')}`}
                      </button>
                    </div>
                  </>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}