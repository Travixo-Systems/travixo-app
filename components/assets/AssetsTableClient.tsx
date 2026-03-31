// components/assets/AssetsTableClient.tsx
'use client'

import { useState } from 'react'
import { QrCodeIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Shield } from 'lucide-react'
import { VGPStatusBadge } from '@/components/vgp/VGPStatusBadge'
import type { VGPStatus } from '@/components/vgp/VGPStatusBadge'
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
    vgp_status?: VGPStatus | null
    asset_categories?: {
        id: string
        name: string
        color: string
    } | null
}

export default function AssetsTableClient({ assets, onRefresh }: { assets: Asset[]; onRefresh?: () => void }) {
    const { language } = useLanguage()
    const t = createTranslator(language)
    
    const [qrAsset, setQrAsset] = useState<Asset | null>(null)
    const [editAsset, setEditAsset] = useState<Asset | null>(null)
    const [deleteAsset, setDeleteAsset] = useState<Asset | null>(null)
    const [vgpAsset, setVgpAsset] = useState<Asset | null>(null)

    const getCategoryCode = (name: string): string => {
        const KNOWN_CODES: Record<string, string> = {
            'nacelle': 'NAC',
            'engin de chantier': 'ENG',
            'chariot elevateur': 'CHA',
            'chariot élévateur': 'CHA',
            'echafaudage': 'ECH',
            'échafaudage': 'ECH',
            'groupe electrogene': 'GE',
            'groupe électrogène': 'GE',
            'compresseur': 'COMP',
            'equipement de levage': 'LEV',
            'équipement de levage': 'LEV',
        }
        const lower = name.toLowerCase().trim()
        if (KNOWN_CODES[lower]) return KNOWN_CODES[lower]
        // Fallback: first 3 uppercase letters
        return name.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()
    }

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'available': return t('assets.statusAvailable')
            case 'in_use': return t('assets.statusInUse')
            case 'maintenance': return t('assets.statusMaintenance')
            case 'retired': return t('assets.statusRetired')
            default: return status
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'available': return 'text-[#059669]'
            case 'in_use': return 'text-[#444444]'
            case 'maintenance': return 'text-[#d97706]'
            case 'retired': return 'text-[#dc2626]'
            default: return 'text-[#444444]'
        }
    }

    return (
        <>
            <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--card-bg, #edeff2)', padding: '16px 20px' }}>
                <table className="min-w-full">
                    <thead>
                        <tr>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderName')}
                            </th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderSerial')}
                            </th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderCategory')}
                            </th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderStatus')}
                            </th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                VGP
                            </th>
                            <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderLocation')}
                            </th>
                            <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderActions')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: '#dcdee3' }}>
                        {assets.map((asset) => (
                            <tr key={asset.id} className="hover:bg-black/[0.02]" style={{ borderColor: '#dcdee3' }}>
                                <td className="px-6 py-4 whitespace-nowrap text-[13px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                                    {asset.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-[13px]" style={{ color: 'var(--text-secondary, #444444)' }}>
                                    {asset.serial_number || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-[13px]" style={{ color: 'var(--text-secondary, #444444)' }}>
                                    {asset.asset_categories?.name ? (
                                        <>
                                            <span className="font-mono text-xs" style={{ color: 'var(--text-hint, #888888)' }}>{getCategoryCode(asset.asset_categories.name)}</span>
                                            {' '}{asset.asset_categories.name}
                                        </>
                                    ) : (
                                        <span style={{ color: 'var(--text-hint, #888888)' }}>-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`text-[13px] font-medium ${getStatusColor(asset.status)}`}>
                                        {getStatusLabel(asset.status)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <VGPStatusBadge status={asset.vgp_status ?? 'unknown'} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-[13px]" style={{ color: 'var(--text-secondary, #444444)' }}>
                                    {asset.current_location || '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end items-center gap-1">
                                        <button
                                            onClick={() => setVgpAsset(asset)}
                                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
                                            style={{ color: 'var(--text-muted, #777)', backgroundColor: 'transparent' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary, #444)' }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}
                                            title={t('assets.tooltipAddVgp')}
                                            aria-label={t('assets.tooltipAddVgp')}
                                        >
                                            <Shield className="h-5 w-5" aria-hidden="true" />
                                        </button>
                                        <button
                                            onClick={() => setQrAsset(asset)}
                                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
                                            style={{ color: 'var(--text-muted, #777)', backgroundColor: 'transparent' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary, #444)' }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}
                                            title={t('assets.tooltipViewQr')}
                                            aria-label={t('assets.tooltipViewQr')}
                                        >
                                            <QrCodeIcon className="h-5 w-5" aria-hidden="true" />
                                        </button>
                                        <button
                                            onClick={() => setEditAsset(asset)}
                                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
                                            style={{ color: 'var(--text-muted, #777)', backgroundColor: 'transparent' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary, #444)' }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}
                                            title={t('assets.tooltipEdit')}
                                            aria-label={t('assets.tooltipEdit')}
                                        >
                                            <PencilIcon className="h-5 w-5" aria-hidden="true" />
                                        </button>
                                        <button
                                            onClick={() => setDeleteAsset(asset)}
                                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 text-[#dc2626] hover:bg-red-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                                            title={t('assets.tooltipDelete')}
                                            aria-label={t('assets.tooltipDelete')}
                                        >
                                            <TrashIcon className="h-5 w-5" aria-hidden="true" />
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
                    onClose={() => { setEditAsset(null); onRefresh?.() }}
                    asset={editAsset}
                />
            )}

            {deleteAsset && (
                <DeleteAssetDialog
                    isOpen={!!deleteAsset}
                    onClose={() => { setDeleteAsset(null); onRefresh?.() }}
                    asset={deleteAsset}
                />
            )}

            {vgpAsset && (
                <AddVGPScheduleModal
                    asset={{
                        id: vgpAsset.id,
                        name: vgpAsset.name,
                        serial_number: vgpAsset.serial_number ?? undefined,
                        category: vgpAsset.asset_categories?.name || 'Unknown'
                    }}
                    onClose={() => setVgpAsset(null)}
                    onSuccess={() => {
                        setVgpAsset(null)
                        toast.success(t('assets.toastVgpScheduleCreated'))
                        onRefresh?.()
                    }}
                />
            )}
        </>
    )
}
