// components/assets/AssetsTableClient.tsx
'use client'

import { useState } from 'react'
import { QrCodeIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Shield } from 'lucide-react'
import ViewQRModal from './ViewQRModal'
import EditAssetModal from './EditAssetModal'
import DeleteAssetDialog from './DeleteAssetDialog'
import AddVGPScheduleModal from '@/components/vgp/AddVGPScheduleModal'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import toast from 'react-hot-toast'

interface Asset {
    id: string
    name: string
    serial_number: string | null
    description: string | null
    status: string
    current_location: string | null
    purchase_date: string | null
    purchase_price: number | null
    current_value: number | null
    qr_code: string
    category_id: string | null
    asset_categories?: {
        id: string
        name: string
        color: string
    } | null
}

export default function AssetsTableClient({ assets }: { assets: Asset[] }) {
    const { language } = useLanguage()
    const t = createTranslator(language)
    
    const [qrAsset, setQrAsset] = useState<Asset | null>(null)
    const [editAsset, setEditAsset] = useState<Asset | null>(null)
    const [deleteAsset, setDeleteAsset] = useState<Asset | null>(null)
    const [vgpAsset, setVgpAsset] = useState<Asset | null>(null)

    // Helper to get translated status
    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'available': return t('assets.statusAvailable')
            case 'in_use': return t('assets.statusInUse')
            case 'maintenance': return t('assets.statusMaintenance')
            case 'retired': return t('assets.statusRetired')
            default: return status
        }
    }

    // Helper to get status badge color
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'available': return 'bg-green-100 text-green-800'
            case 'in_use': return 'bg-blue-100 text-blue-800'
            case 'maintenance': return 'bg-yellow-100 text-yellow-800'
            case 'retired': return 'bg-gray-100 text-gray-800'
            default: return 'bg-gray-100 text-gray-800'
        }
    }

    return (
        <>
            <div className="bg-white shadow rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                {t('assets.tableHeaderName')}
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                {t('assets.tableHeaderSerial')}
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                {t('assets.tableHeaderCategory')}
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                {t('assets.tableHeaderStatus')}
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                {t('assets.tableHeaderLocation')}
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                {t('assets.tableHeaderActions')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {assets.map((asset) => (
                            <tr key={asset.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {asset.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {asset.serial_number || '-'}
                                </td>
                                {/* Category Column - NEW */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {asset.asset_categories?.name ? (
                                        <span 
                                            className="px-3 py-1 text-xs font-medium rounded-full text-white"
                                            style={{ backgroundColor: asset.asset_categories.color || '#6B7280' }}
                                            title={asset.asset_categories.name}
                                        >
                                            {asset.asset_categories.name}
                                        </span>
                                    ) : (
                                        <span className="text-sm text-gray-400">-</span>
                                    )}
                                </td>
                                {/* Status Column */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(asset.status)}`}>
                                        {getStatusLabel(asset.status)}
                                    </span>
                                </td>
                                {/* Location Column */}
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {asset.current_location || '-'}
                                </td>
                                {/* Actions Column */}
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end space-x-2">
                                        {/* VGP Button */}
                                        <button
                                            onClick={() => setVgpAsset(asset)}
                                            className="text-blue-600 hover:text-blue-900 transition-colors"
                                            title={t('assets.tooltipAddVgp')}
                                        >
                                            <Shield className="h-5 w-5" />
                                        </button>
                                        
                                        {/* QR Button */}
                                        <button
                                            onClick={() => setQrAsset(asset)}
                                            className="text-indigo-600 hover:text-indigo-900 transition-colors"
                                            title={t('assets.tooltipViewQr')}
                                        >
                                            <QrCodeIcon className="h-5 w-5" />
                                        </button>
                                        
                                        {/* Edit Button */}
                                        <button
                                            onClick={() => setEditAsset(asset)}
                                            className="text-gray-600 hover:text-gray-900 transition-colors"
                                            title={t('assets.tooltipEdit')}
                                        >
                                            <PencilIcon className="h-5 w-5" />
                                        </button>
                                        
                                        {/* Delete Button */}
                                        <button
                                            onClick={() => setDeleteAsset(asset)}
                                            className="text-red-600 hover:text-red-900 transition-colors"
                                            title={t('assets.tooltipDelete')}
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {qrAsset && (
                <ViewQRModal
                    isOpen={!!qrAsset}
                    onClose={() => setQrAsset(null)}
                    asset={qrAsset}
                />
            )}

            {editAsset && (
                <EditAssetModal
                    isOpen={!!editAsset}
                    onClose={() => setEditAsset(null)}
                    asset={editAsset}
                />
            )}

            {deleteAsset && (
                <DeleteAssetDialog
                    isOpen={!!deleteAsset}
                    onClose={() => setDeleteAsset(null)}
                    asset={deleteAsset}
                />
            )}

            {/* VGP Modal */}
            {vgpAsset && (
                <AddVGPScheduleModal
                    asset={{
                        id: vgpAsset.id,
                        name: vgpAsset.name,
                        serial_number: vgpAsset.serial_number,
                        category: vgpAsset.asset_categories?.name || 'Unknown'
                    }}
                    onClose={() => setVgpAsset(null)}
                    onSuccess={() => {
                        setVgpAsset(null)
                        toast.success(t('assets.toastVgpScheduleCreated'))
                    }}
                />
            )}
        </>
    )
}