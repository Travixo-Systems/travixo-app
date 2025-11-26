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
          <div className="fixed inset-0 bg-black bg-opacity-25" />
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
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                <div className="flex justify-between items-center mb-4">
                  <Dialog.Title className="text-2xl font-bold text-gray-900">
                    {t('assets.importTitle')}
                  </Dialog.Title>
                  <button onClick={resetModal} className="text-gray-400 hover:text-gray-500">
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {!preview ? (
                  <>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileChange}
                        className="hidden"
                        id="file-upload"
                      />
                      <label htmlFor="file-upload" className="cursor-pointer">
                        <ArrowUpTrayIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                        <p className="text-lg mb-2">
                          {file ? file.name : t('assets.importDropzone')}
                        </p>
                        <p className="text-sm text-gray-500">
                          {t('assets.importSupportedFormats')}
                        </p>
                      </label>
                    </div>

                    {file && (
                      <button
                        onClick={processFile}
                        disabled={isProcessing}
                        className="w-full mt-6 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {isProcessing ? t('assets.importProcessing') : t('assets.importPreview')}
                      </button>
                    )}

                    <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="font-semibold mb-2 text-blue-900">{t('assets.importSmartDetection')}</h3>
                      <p className="text-sm text-blue-800">
                        {t('assets.importSmartDetectionDesc')}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-6">
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center gap-2">
                            <CheckCircleIcon className="h-6 w-6 text-green-600" />
                            <div>
                              <p className="text-2xl font-bold text-green-900">{preview.valid.length}</p>
                              <p className="text-sm text-green-700">{t('assets.importValidRows')}</p>
                            </div>
                          </div>
                        </div>
                        
                        {preview.invalid.length > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <div className="flex items-center gap-2">
                              <ExclamationCircleIcon className="h-6 w-6 text-red-600" />
                              <div>
                                <p className="text-2xl font-bold text-red-900">{preview.invalid.length}</p>
                                <p className="text-sm text-red-700">{t('assets.importInvalidRows')}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <div>
                            <p className="text-2xl font-bold text-gray-900">{preview.total}</p>
                            <p className="text-sm text-gray-700">{t('assets.importTotalRows')}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                        <h4 className="font-semibold text-indigo-900 mb-2">{t('assets.importDetectedColumns')}</h4>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(preview.detectedColumns).map(([key, value]) => (
                            <span key={key} className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm">
                              {value} &rarr; {key}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto border rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">{t('assets.tableHeaderName')}</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">{t('assets.tableHeaderSerial')}</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">{t('assets.tableHeaderLocation')}</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">{t('assets.tableHeaderStatus')}</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {preview.valid.slice(0, 10).map((row, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-2 text-sm">{row.name}</td>
                              <td className="px-4 py-2 text-sm">{row.serial_number || '-'}</td>
                              <td className="px-4 py-2 text-sm">{row.current_location || '-'}</td>
                              <td className="px-4 py-2 text-sm">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  row.status === 'available' ? 'bg-green-100 text-green-800' :
                                  row.status === 'in_use' ? 'bg-blue-100 text-blue-800' :
                                  row.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
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
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        {t('assets.importChooseDifferent')}
                      </button>
                      <button
                        onClick={handleImport}
                        disabled={isImporting || preview.valid.length === 0}
                        className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
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