'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'

export default function ScanPage() {
  const params = useParams()
  const supabase = createClient()
  const [asset, setAsset] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadAsset()
  }, [])

  async function loadAsset() {
    try {
      const { data, error } = await supabase
        .from('assets')
        .select(`
          *,
          organization:organizations(name)
        `)
        .eq('qr_code', params.code)
        .single()

      if (error || !data) {
        setError(true)
        return
      }

      setAsset(data)

      // Log the scan (optional, no auth required)
      await supabase.from('scans').insert({
        asset_id: data.id,
        scan_type: 'check',
        scanned_at: new Date().toISOString()
      })

    } catch (err) {
      console.error('Error loading asset:', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading asset...</p>
        </div>
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Asset Not Found</h1>
          <p className="text-gray-600">This QR code is not registered in the system.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-6 text-white">
            <h1 className="text-3xl font-bold">{asset.name}</h1>
            <p className="text-indigo-100 mt-1">
              {asset.organization?.name || 'Asset Information'}
            </p>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <InfoCard label="Serial Number" value={asset.serial_number || 'N/A'} />
              <InfoCard label="Status" value={asset.status} />
              <InfoCard label="Location" value={asset.current_location || 'N/A'} />
              <InfoCard 
                label="Purchase Date" 
                value={asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : 'N/A'} 
              />
            </div>

            {asset.description && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
                <p className="text-gray-700 text-sm">{asset.description}</p>
              </div>
            )}

            {asset.purchase_price && (
              <div className="bg-indigo-50 rounded-lg p-4">
                <h3 className="font-semibold text-indigo-900 mb-2">Purchase Price</h3>
                <p className="text-2xl font-bold text-indigo-600">
                  €{asset.purchase_price.toLocaleString()}
                </p>
              </div>
            )}

            <div className="pt-4 border-t">
              <p className="text-xs text-gray-500 text-center">
                Asset ID: {asset.id}
              </p>
              <p className="text-xs text-gray-500 text-center mt-1">
                Scanned at {new Date().toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-sm text-gray-600">
            Powered by <span className="font-semibold text-indigo-600">TraviXO</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs text-gray-600 mb-1">{label}</p>
      <p className="font-semibold text-gray-900">
        {value === 'available' && <span className="text-green-600">Available</span>}
        {value === 'in_use' && <span className="text-blue-600">In Use</span>}
        {value === 'maintenance' && <span className="text-yellow-600">Maintenance</span>}
        {value === 'retired' && <span className="text-gray-600">Retired</span>}
        {!['available', 'in_use', 'maintenance', 'retired'].includes(value) && value}
      </p>
    </div>
  )
}