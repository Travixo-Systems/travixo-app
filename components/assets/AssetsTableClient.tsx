// components/assets/AssetsTableClient.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { QrCodeIcon, PencilIcon, ArchiveBoxXMarkIcon } from '@heroicons/react/24/outline'
import { Shield } from 'lucide-react'
import { VGPStatusBadge } from '@/components/vgp/VGPStatusBadge'
import type { VGPStatus } from '@/components/vgp/VGPStatusBadge'
import ViewQRModal from './ViewQRModal'
import EditAssetModal from './EditAssetModal'
import RetireAssetModal from './RetireAssetModal'
import AddVGPScheduleModal from '@/components/vgp/AddVGPScheduleModal'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'

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
    archived_at?: string | null
    archive_reason?: string | null
    asset_categories?: {
        id: string
        name: string
    } | null
}

const REASON_LABELS: Record<string, { fr: string; en: string }> = {
    vendu: { fr: 'Vendu', en: 'Sold' },
    ferraille: { fr: 'Ferraillé', en: 'Scrapped' },
    transfere: { fr: 'Transféré', en: 'Transferred' },
    hors_service: { fr: 'Hors service', en: 'Out of service' },
}

export default function AssetsTableClient({ assets, onRefresh }: { assets: Asset[]; onRefresh?: () => void }) {
    const { language } = useLanguage()
    const t = createTranslator(language)
    
    const supabase = createClient()
    const [qrAsset, setQrAsset] = useState<Asset | null>(null)
    const [editAsset, setEditAsset] = useState<Asset | null>(null)
    const [retireAsset, setRetireAsset] = useState<Asset | null>(null)
    const [vgpAsset, setVgpAsset] = useState<Asset | null>(null)
    const [expandedCard, setExpandedCard] = useState<string | null>(null)

    const handleRestore = async (asset: Asset) => {
        try {
            const { error } = await supabase
                .from('assets')
                .update({
                    archived_at: null,
                    archived_by: null,
                    archive_reason: null,
                    status: 'available',
                })
                .eq('id', asset.id)

            if (error) throw error

            toast.success(
                language === 'fr'
                    ? 'Équipement restauré dans le parc actif'
                    : 'Equipment restored to active fleet'
            )
            onRefresh?.()
        } catch (error) {
            console.error('Error restoring asset:', error)
            toast.error(
                language === 'fr' ? 'Erreur lors de la restauration' : 'Failed to restore asset'
            )
        }
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

    const getStatusColorHex = (status: string) => {
        switch (status) {
            case 'available': return '#059669'
            case 'in_use': return '#444444'
            case 'maintenance': return '#d97706'
            case 'retired': return '#dc2626'
            default: return '#444444'
        }
    }

    const getVgpBorderColor = (vgpStatus: VGPStatus | null | undefined) => {
        switch (vgpStatus) {
            case 'overdue': return '#dc2626'
            case 'upcoming': return '#d97706'
            case 'compliant': return '#059669'
            default: return '#6b7280'
        }
    }

    return (
        <>
            {/* ====== MOBILE/TABLET: Card Grid ====== */}
            <div className="min-[1026px]:hidden grid grid-cols-1 sm:grid-cols-2 gap-2">
                {assets.map((asset) => {
                    const isArchived = !!asset.archived_at
                    const reasonLabel = asset.archive_reason
                        ? (REASON_LABELS[asset.archive_reason]?.[language === 'fr' ? 'fr' : 'en'] || asset.archive_reason)
                        : null
                    const isExpanded = expandedCard === asset.id

                    return (
                        <div
                            key={asset.id}
                            className="rounded-lg cursor-pointer transition-colors"
                            style={{
                                backgroundColor: 'var(--card-bg, #edeff2)',
                                borderLeft: `3px solid ${getVgpBorderColor(asset.vgp_status)}`,
                                padding: 12,
                                opacity: isArchived ? 0.5 : 1,
                            }}
                            onClick={() => setExpandedCard(isExpanded ? null : asset.id)}
                        >
                            {/* Line 1: Name + VGP badge */}
                            <div className="flex items-start justify-between gap-2">
                                <Link
                                    href={`/assets/${asset.id}`}
                                    className="text-[13px] sm:text-[14px] font-semibold leading-snug min-w-0"
                                    style={{ color: 'var(--text-primary, #1a1a1a)' }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {asset.name}
                                </Link>
                                <div className="flex-shrink-0 mt-0.5">
                                    <span className="text-[10px] sm:text-[11px]">
                                        <VGPStatusBadge status={asset.vgp_status ?? 'unknown'} language={language} />
                                    </span>
                                </div>
                            </div>

                            {/* Line 2: Serial */}
                            <p className="text-[11px] sm:text-[12px] font-mono mt-0.5" style={{ color: 'var(--text-hint, #888)' }}>
                                {asset.serial_number || '—'}
                            </p>

                            {/* Line 3: Category */}
                            {asset.asset_categories?.name && (
                                <p className="text-[11px] sm:text-[12px] mt-0.5" style={{ color: 'var(--text-muted, #777)' }}>
                                    {asset.asset_categories.name}
                                </p>
                            )}

                            {/* Line 4: Location | Status — below divider */}
                            <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '0.5px solid #dcdee3' }}>
                                <span className="text-[11px] sm:text-[12px]" style={{ color: 'var(--text-secondary, #444)' }}>
                                    {asset.current_location || '—'}
                                </span>
                                {isArchived ? (
                                    <span className="text-[11px] sm:text-[12px] font-medium flex-shrink-0 ml-2" style={{ color: 'var(--text-hint, #888)' }}>
                                        {language === 'fr' ? 'Retiré' : 'Retired'}{reasonLabel ? ` · ${reasonLabel}` : ''}
                                    </span>
                                ) : (
                                    <span className="text-[11px] sm:text-[12px] font-medium flex-shrink-0 ml-2" style={{ color: getStatusColorHex(asset.status) }}>
                                        {getStatusLabel(asset.status)}
                                    </span>
                                )}
                            </div>

                            {/* Expanded: Action buttons */}
                            {isExpanded && (
                                <div className="flex gap-1.5 mt-3 pt-2" style={{ borderTop: '0.5px solid #dcdee3' }}>
                                    {isArchived ? (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleRestore(asset) }}
                                            className="flex-1 min-h-[44px] rounded text-[12px] font-medium text-white"
                                            style={{ backgroundColor: 'var(--accent, #e8600a)' }}
                                        >
                                            {language === 'fr' ? 'Restaurer' : 'Restore'}
                                        </button>
                                    ) : (
                                        <>
                                            <Link
                                                href={`/assets/${asset.id}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex-1 min-h-[44px] rounded text-[12px] font-medium text-white flex items-center justify-center"
                                                style={{ backgroundColor: 'var(--sidebar-bg, #0a2730)' }}
                                            >
                                                {language === 'fr' ? 'Détails' : 'Details'}
                                            </Link>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setVgpAsset(asset) }}
                                                className="flex-1 min-h-[44px] rounded text-[12px] font-medium text-white flex items-center justify-center"
                                                style={{ backgroundColor: 'var(--accent, #e8600a)' }}
                                            >
                                                VGP
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setQrAsset(asset) }}
                                                className="flex-1 min-h-[44px] rounded text-[12px] font-medium flex items-center justify-center"
                                                style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-secondary, #444)' }}
                                            >
                                                QR
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setEditAsset(asset) }}
                                                className="flex-1 min-h-[44px] rounded text-[12px] font-medium flex items-center justify-center"
                                                style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-secondary, #444)' }}
                                            >
                                                {language === 'fr' ? 'Modifier' : 'Edit'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* ====== DESKTOP: Table Layout ====== */}
            <div className="hidden min-[1026px]:block rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--card-bg, #edeff2)', padding: '16px 20px' }}>
                <table className="min-w-full">
                    <thead>
                        <tr>
                            <th className="px-6 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderName')}
                            </th>
                            <th className="px-6 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderSerial')}
                            </th>
                            <th className="px-6 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderCategory')}
                            </th>
                            <th className="px-6 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderStatus')}
                            </th>
                            <th className="px-6 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                VGP
                            </th>
                            <th className="px-6 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderLocation')}
                            </th>
                            <th className="px-6 py-3 text-right text-[12px] font-semibold uppercase tracking-[0.5px]" style={{ color: 'var(--text-hint, #888888)' }}>
                                {t('assets.tableHeaderActions')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: '#dcdee3' }}>
                        {assets.map((asset) => {
                            const isArchived = !!asset.archived_at
                            const reasonLabel = asset.archive_reason
                                ? (REASON_LABELS[asset.archive_reason]?.[language === 'fr' ? 'fr' : 'en'] || asset.archive_reason)
                                : null

                            return (
                                <tr key={asset.id} className="hover:bg-black/[0.02]" style={{ borderColor: '#dcdee3', opacity: isArchived ? 0.5 : 1 }}>
                                    <td className="px-6 py-4 whitespace-nowrap text-[14px] font-semibold">
                                        <Link
                                            href={`/assets/${asset.id}`}
                                            className="transition-colors hover:underline"
                                            style={{ color: 'var(--text-primary, #1a1a1a)' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent, #e8600a)' }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-primary, #1a1a1a)' }}
                                        >
                                            {asset.name}
                                        </Link>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-[14px]" style={{ color: 'var(--text-secondary, #444444)' }}>
                                        {asset.serial_number || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-[14px]" style={{ color: 'var(--text-secondary, #444444)' }}>
                                        {asset.asset_categories?.name || (
                                            <span style={{ color: 'var(--text-hint, #888888)' }}>-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {isArchived ? (
                                            <span
                                                className="inline-flex items-center px-2 py-0.5 rounded text-[13px] font-medium"
                                                style={{ backgroundColor: 'var(--input-bg, #e3e5e9)', color: 'var(--text-hint, #888)' }}
                                            >
                                                Retiré{reasonLabel ? ` · ${reasonLabel}` : ''}
                                            </span>
                                        ) : (
                                            <span className={`text-[14px] font-medium ${getStatusColor(asset.status)}`}>
                                                {getStatusLabel(asset.status)}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <VGPStatusBadge status={asset.vgp_status ?? 'unknown'} language={language} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-[14px]" style={{ color: 'var(--text-secondary, #444444)' }}>
                                        {asset.current_location || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {isArchived ? (
                                            <button
                                                onClick={() => handleRestore(asset)}
                                                className="text-[14px] font-medium transition-colors hover:underline"
                                                style={{ color: 'var(--accent, #e8600a)' }}
                                            >
                                                {language === 'fr' ? 'Restaurer' : 'Restore'}
                                            </button>
                                        ) : (
                                            <div className="flex justify-end items-center gap-1 relative z-10">
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setVgpAsset(asset) }}
                                                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
                                                    style={{ color: 'var(--text-muted, #777)' }}
                                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary, #444)' }}
                                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}
                                                    title={t('assets.tooltipAddVgp')}
                                                    aria-label={t('assets.tooltipAddVgp')}
                                                >
                                                    <Shield className="h-5 w-5 pointer-events-none" aria-hidden="true" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setQrAsset(asset) }}
                                                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
                                                    style={{ color: 'var(--text-muted, #777)' }}
                                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary, #444)' }}
                                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}
                                                    title={t('assets.tooltipViewQr')}
                                                    aria-label={t('assets.tooltipViewQr')}
                                                >
                                                    <QrCodeIcon className="h-5 w-5 pointer-events-none" aria-hidden="true" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setEditAsset(asset) }}
                                                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
                                                    style={{ color: 'var(--text-muted, #777)' }}
                                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary, #444)' }}
                                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}
                                                    title={t('assets.tooltipEdit')}
                                                    aria-label={t('assets.tooltipEdit')}
                                                >
                                                    <PencilIcon className="h-5 w-5 pointer-events-none" aria-hidden="true" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setRetireAsset(asset) }}
                                                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2.5 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#f26f00]"
                                                    style={{ color: 'var(--text-muted, #777)' }}
                                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary, #444)' }}
                                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #777)' }}
                                                    title={language === 'fr' ? 'Retirer' : 'Retire'}
                                                    aria-label={language === 'fr' ? 'Retirer' : 'Retire'}
                                                >
                                                    <ArchiveBoxXMarkIcon className="h-5 w-5 pointer-events-none" aria-hidden="true" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
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

            {retireAsset && (
                <RetireAssetModal
                    isOpen={!!retireAsset}
                    onClose={() => { setRetireAsset(null); onRefresh?.() }}
                    asset={retireAsset}
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
