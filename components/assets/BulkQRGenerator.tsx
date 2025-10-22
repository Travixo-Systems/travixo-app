'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'

interface Asset {
  id: string
  name: string
  qr_code: string
  serial_number?: string
  category?: string
  location?: string
}

interface BulkQRGeneratorProps {
  assets: Asset[]
}

export default function BulkQRGenerator({ assets }: BulkQRGeneratorProps) {
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)

  const toggleAsset = (assetId: string) => {
    const newSelected = new Set(selectedAssets)
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId)
    } else {
      newSelected.add(assetId)
    }
    setSelectedAssets(newSelected)
  }

  const selectAll = () => {
    setSelectedAssets(new Set(assets.map(a => a.id)))
  }

  const deselectAll = () => {
    setSelectedAssets(new Set())
  }

  const exportToCSV = () => {
    const selectedAssetList = assets.filter(a => selectedAssets.has(a.id))
    const csvContent = [
      ['Asset Name', 'Serial Number', 'Category', 'Location', 'QR Code', 'Scan URL'],
      ...selectedAssetList.map(a => [
        a.name,
        a.serial_number || '',
        a.category || '',
        a.location || '',
        a.qr_code,
        `${window.location.origin}/scan/${a.qr_code}`
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `TraviXO-Assets-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    window.URL.revokeObjectURL(url)
    toast.success('CSV exported successfully!')
  }

  const generateBulkQRCodes = async () => {
    if (selectedAssets.size === 0) {
      toast.error('Please select at least one asset')
      return
    }

    setIsGenerating(true)

    try {
      const selectedAssetList = assets.filter(a => selectedAssets.has(a.id))
      
      // Generate QR codes
      const qrDataUrls = await Promise.all(
        selectedAssetList.map(async (asset) => {
          const qrUrl = `${window.location.origin}/scan/${asset.qr_code}`
          const dataUrl = await QRCode.toDataURL(qrUrl, {
            width: 200,
            margin: 1,
          })
          return { asset, dataUrl }
        })
      )

      // Create PDF - 6 columns x 5 rows = 30 QR codes per page
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const pageWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const margin = 10
      const cols = 6
      const rows = 5
      const qrSize = (pageWidth - margin * 2) / cols
      const qrImageSize = qrSize * 0.7
      const perPage = cols * rows

      qrDataUrls.forEach((item, index) => {
        const pageIndex = Math.floor(index / perPage)
        const positionInPage = index % perPage
        
        // Add new page if needed
        if (index > 0 && positionInPage === 0) {
          pdf.addPage()
        }

        const col = positionInPage % cols
        const row = Math.floor(positionInPage / cols)
        
        const x = margin + col * qrSize
        const y = margin + row * (pageHeight - margin * 2) / rows

        // Draw border
        pdf.setDrawColor(200, 200, 200)
        pdf.rect(x, y, qrSize, qrSize * 1.2)

        // Add QR code image
        const imgX = x + (qrSize - qrImageSize) / 2
        const imgY = y + 5
        pdf.addImage(item.dataUrl, 'PNG', imgX, imgY, qrImageSize, qrImageSize)

        // Add asset name below QR code
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'bold')
        const textY = imgY + qrImageSize + 3
        const text = item.asset.name.length > 20 
          ? item.asset.name.substring(0, 20) + '...' 
          : item.asset.name
        pdf.text(text, x + qrSize / 2, textY, { align: 'center' })

        // Add serial number if available
        if (item.asset.serial_number) {
          pdf.setFontSize(6)
          pdf.setFont('helvetica', 'normal')
          pdf.text(item.asset.serial_number, x + qrSize / 2, textY + 3, { align: 'center' })
        }
      })

      // Download PDF
      pdf.save(`TraviXO-QR-Codes-${new Date().toISOString().split('T')[0]}.pdf`)
      
      toast.success(`Generated ${selectedAssets.size} QR codes!`)
      deselectAll()

    } catch (error) {
      console.error('Error generating QR codes:', error)
      toast.error('Failed to generate QR codes')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Bulk QR Code Generator</h2>
          <p className="text-sm text-gray-600 mt-1">
            Select assets to generate printable QR codes (30 per page)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={selectAll}
            className="px-3 py-1.5 text-sm bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-md font-medium"
          >
            Select All ({assets.length})
          </button>
          <button
            onClick={deselectAll}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md font-medium"
          >
            Clear
          </button>
          {selectedAssets.size > 0 && (
            <button
              onClick={exportToCSV}
              className="px-3 py-1.5 text-sm bg-green-100 text-green-700 hover:bg-green-200 rounded-md font-medium"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {selectedAssets.size > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p className="text-indigo-900 font-medium">
              {selectedAssets.size} asset{selectedAssets.size !== 1 ? 's' : ''} selected
              {selectedAssets.size > 30 && (
                <span className="ml-2 text-sm text-indigo-700">
                  ({Math.ceil(selectedAssets.size / 30)} pages)
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={exportToCSV}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                Export CSV
              </button>
              <button
                onClick={generateBulkQRCodes}
                disabled={isGenerating}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {isGenerating ? 'Generating...' : 'Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-h-96 overflow-y-auto border rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedAssets.size === assets.length && assets.length > 0}
                  onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serial Number</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {assets.map((asset) => (
              <tr
                key={asset.id}
                className={`cursor-pointer hover:bg-gray-50 ${
                  selectedAssets.has(asset.id) ? 'bg-indigo-50' : ''
                }`}
                onClick={() => toggleAsset(asset.id)}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedAssets.has(asset.id)}
                    onChange={() => toggleAsset(asset.id)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{asset.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{asset.serial_number || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{asset.category || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{asset.location || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Print Instructions</h4>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Select the assets you want to print QR codes for</li>
          <li>Click "Generate PDF" to download a printable PDF (30 QR codes per A4 page)</li>
          <li>Print on adhesive label sheets (recommended: Avery 5160 or equivalent)</li>
          <li>Cut and stick labels on your equipment</li>
          <li>Use "Export CSV" to get a spreadsheet of all selected assets with URLs</li>
        </ol>
        <div className="mt-3 pt-3 border-t border-blue-300">
          <p className="text-xs text-blue-700">
            <strong>Pro Tip:</strong> Each QR code links to {typeof window !== 'undefined' ? window.location.origin : ''}/scan/[code] for easy asset tracking
          </p>
        </div>
      </div>
    </div>
  )
}