// components/assets/AssetsTableClient.tsx
'use client'

import { useState } from 'react'
import { QrCodeIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Shield } from 'lucide-react' // Add this import
import ViewQRModal from './ViewQRModal'
import EditAssetModal from './EditAssetModal'
import DeleteAssetDialog from './DeleteAssetDialog'
import AddVGPScheduleModal from '@/components/vgp/AddVGPScheduleModal' // Add this import

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
}

export default function AssetsTableClient({ assets }: { assets: Asset[] }) {
    const [qrAsset, setQrAsset] = useState<Asset | null>(null)
    const [editAsset, setEditAsset] = useState<Asset | null>(null)
    const [deleteAsset, setDeleteAsset] = useState<Asset | null>(null)
    const [vgpAsset, setVgpAsset] = useState<Asset | null>(null) // Add VGP state

    return (
        <>
            <div className="bg-white shadow rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serial</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
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
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                        asset.status === 'available' ? 'bg-green-100 text-green-800' :
                                        asset.status === 'in_use' ? 'bg-blue-100 text-blue-800' :
                                        asset.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-gray-100 text-gray-800'
                                    }`}>
                                        {asset.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {asset.current_location || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end space-x-2">
                                        {/* VGP Button - NEW */}
                                        <button
                                            onClick={() => setVgpAsset(asset)}
                                            className="text-blue-600 hover:text-blue-900"
                                            title="Add VGP Schedule"
                                        >
                                            <Shield className="h-5 w-5" />
                                        </button>
                                        
                                        <button
                                            onClick={() => setQrAsset(asset)}
                                            className="text-indigo-600 hover:text-indigo-900"
                                            title="View QR Code"
                                        >
                                            <QrCodeIcon className="h-5 w-5" />
                                        </button>
                                        <button
                                            onClick={() => setEditAsset(asset)}
                                            className="text-gray-600 hover:text-gray-900"
                                            title="Edit"
                                        >
                                            <PencilIcon className="h-5 w-5" />
                                        </button>
                                        <button
                                            onClick={() => setDeleteAsset(asset)}
                                            className="text-red-600 hover:text-red-900"
                                            title="Delete"
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

            {/* VGP Modal - NEW */}
            {vgpAsset && (
                <AddVGPScheduleModal
                    asset={{
                        id: vgpAsset.id,
                        name: vgpAsset.name,
                        serial_number: vgpAsset.serial_number,
                        category: vgpAsset.description // or map to a category field if you have one
                    }}
                    onClose={() => setVgpAsset(null)}
                    onSuccess={() => {
                        setVgpAsset(null)
                        // Show success toast
                        alert('VGP schedule created! Check the VGP Compliance dashboard.')
                    }}
                />
            )}
        </>
    )
}