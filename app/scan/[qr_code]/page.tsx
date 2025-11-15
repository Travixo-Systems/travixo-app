'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  ArrowLeft, 
  Package, 
  MapPin, 
  Calendar,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Navigation,
  Wrench,
  CircleSlash
} from 'lucide-react'

interface Asset {
  id: string
  name: string
  serial_number: string | null
  category_id: string | null
  current_location: string | null
  status: string
  purchase_date: string | null
  purchase_price: number | null
  description: string | null
  last_seen_at: string | null
  asset_categories: {
    name: string
  } | null
}

interface PageProps {
  params: Promise<{ qr_code: string }> | { qr_code: string }
}

export default function ScanPage({ params }: PageProps) {
  const router = useRouter()
  
  const [qr_code, setQrCode] = useState<string>('')
  const [asset, setAsset] = useState<Asset | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showLocationForm, setShowLocationForm] = useState(false)
  
  // Form state
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  
  // Message state
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // Resolve params
  useEffect(() => {
    async function resolveParams() {
      const resolvedParams = await Promise.resolve(params)
      setQrCode(resolvedParams.qr_code)
    }
    resolveParams()
  }, [params])

  useEffect(() => {
    if (qr_code) {
      fetchAsset()
    }
  }, [qr_code])

  // Auto-log scan when asset loads
  useEffect(() => {
    if (asset && qr_code) {
      autoLogScan()
    }
  }, [asset])

  // Auto-dismiss messages
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [errorMessage])

  async function fetchAsset() {
    if (!qr_code) return

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('assets')
        .select(`
          *,
          asset_categories (
            name
          )
        `)
        .eq('qr_code', qr_code)
        .single()

      if (error || !data) {
        setErrorMessage('Asset not found')
        setLoading(false)
        return
      }

      setAsset(data)
      setSelectedStatus(data.status || 'available')
    } catch (error) {
      console.error('Error fetching asset:', error)
      setErrorMessage('Failed to load asset')
    } finally {
      setLoading(false)
    }
  }

  async function autoLogScan() {
    if (!asset) return

    try {
      let latitude: number | undefined
      let longitude: number | undefined

      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              maximumAge: 60000,
            })
          })
          latitude = position.coords.latitude
          longitude = position.coords.longitude
        } catch (error) {
          // Silent fail - GPS optional
        }
      }

      await fetch('/api/scan/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: asset.id,
          qr_code: qr_code,
          latitude,
          longitude,
          notes: 'Automatic scan log',
        }),
      })
    } catch (error) {
      // Silent fail - non-critical background logging
    }
  }

  async function handleStatusUpdate(newStatus: string) {
    if (!asset) return
    
    setUpdating(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/scan/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: asset.id,
          qr_code: qr_code,
          status: newStatus,
        }),
      })

      if (!response.ok) throw new Error('Failed')

      const data = await response.json()
      setAsset(data.asset)
      setSelectedStatus(newStatus)
      setSuccessMessage(`Status updated: ${getStatusLabel(newStatus)}`)
    } catch (error) {
      setErrorMessage('Failed to update status')
    } finally {
      setUpdating(false)
    }
  }

  async function handleLocationUpdate() {
    if (!asset || !location.trim()) {
      setErrorMessage('Please enter a location')
      return
    }

    setUpdating(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/scan/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: asset.id,
          qr_code: qr_code,
          location: location.trim(),
          notes: notes.trim() || undefined,
        }),
      })

      if (!response.ok) throw new Error('Failed')

      const data = await response.json()
      setAsset(data.asset)
      setSuccessMessage('Location updated successfully')
      setShowLocationForm(false)
      setLocation('')
      setNotes('')
    } catch (error) {
      setErrorMessage('Failed to update location')
    } finally {
      setUpdating(false)
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocation not supported')
      return
    }

    setUpdating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setLocation(`GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
        setUpdating(false)
        setSuccessMessage('GPS location captured')
      },
      (error) => {
        setErrorMessage('Could not get location')
        setUpdating(false)
      }
    )
  }

  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      available: 'Available',
      in_use: 'In Use',
      maintenance: 'Maintenance',
      out_of_service: 'Out of Service',
    }
    return labels[status] || status
  }

  function getStatusBadgeClass(status: string): string {
    // Traffic light system per charte graphique
    const classes: Record<string, string> = {
      available: 'bg-green-50 text-green-700 border-2 border-green-500',
      in_use: 'bg-blue-50 text-blue-700 border-2 border-blue-500',
      maintenance: 'bg-amber-50 text-amber-700 border-2 border-amber-500',
      out_of_service: 'bg-red-50 text-red-700 border-2 border-red-500',
    }
    return classes[status] || 'bg-gray-50 text-gray-700 border-2 border-gray-400'
  }

  function getStatusButtonClass(status: string, isSelected: boolean): string {
    if (isSelected) {
      const selected: Record<string, string> = {
        available: 'bg-green-500 text-white border-2 border-green-600',
        in_use: 'bg-blue-500 text-white border-2 border-blue-600',
        maintenance: 'bg-amber-500 text-white border-2 border-amber-600',
        out_of_service: 'bg-red-500 text-white border-2 border-red-600',
      }
      return selected[status] || 'bg-gray-500 text-white border-2 border-gray-600'
    }
    
    const unselected: Record<string, string> = {
      available: 'bg-white text-green-700 border-2 border-green-400 hover:bg-green-50',
      in_use: 'bg-white text-blue-700 border-2 border-blue-400 hover:bg-blue-50',
      maintenance: 'bg-white text-amber-700 border-2 border-amber-400 hover:bg-amber-50',
      out_of_service: 'bg-white text-red-700 border-2 border-red-400 hover:bg-red-50',
    }
    return unselected[status] || 'bg-white text-gray-700 border-2 border-gray-400'
  }

  function getStatusIcon(status: string) {
    const icons: Record<string, React.ReactNode> = {
      available: <CheckCircle className="w-5 h-5" />,
      in_use: <Package className="w-5 h-5" />,
      maintenance: <Wrench className="w-5 h-5" />,
      out_of_service: <CircleSlash className="w-5 h-5" />,
    }
    return icons[status] || <Package className="w-5 h-5" />
  }

  function formatTimeSince(timestamp: string | null): string {
    if (!timestamp) return 'Never'
    
    const diff = Date.now() - new Date(timestamp).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (hours < 1) return `${minutes}m ago`
    if (days < 1) return `${hours}h ago`
    return `${days}d ago`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#f26f00]"></div>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center border-l-4 border-b-4 border-red-500">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#00252b] mb-2">Asset Not Found</h1>
          <p className="text-gray-600 mb-6">
            The QR code is not recognized in our system.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-[#f26f00] text-white rounded-lg hover:bg-[#d96200] font-semibold transition-all"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 pb-20">
      {/* Success Message - Charte Graphique Compliant */}
      {successMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4">
          <div className="bg-green-500 rounded-lg p-4 shadow-xl">
            <div className="flex items-center">
              <CheckCircle className="w-6 h-6 text-white mr-3" />
              <p className="text-white font-semibold">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4">
          <div className="bg-red-500 rounded-lg p-4 shadow-xl">
            <div className="flex items-center">
              <XCircle className="w-6 h-6 text-white mr-3" />
              <p className="text-white font-semibold">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-[#f26f00] hover:text-[#d96200] font-semibold mb-4 flex items-center"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <h1 className="text-3xl font-bold text-[#00252b]">{asset.name}</h1>
          {asset.asset_categories && (
            <p className="text-gray-600 mt-1 font-medium">{asset.asset_categories.name}</p>
          )}
        </div>

        {/* Asset Info Card - Signature Pattern: Left + Bottom Border */}
        <div className="bg-white rounded-lg shadow-md border-l-4 border-b-4 border-blue-500 p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <InfoCard 
              icon={<Package className="w-5 h-5" />}
              label="Serial Number" 
              value={asset.serial_number || 'N/A'} 
            />
            <InfoCard
              icon={null}
              label="Status"
              value={
                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold ${getStatusBadgeClass(asset.status)}`}>
                  {getStatusIcon(asset.status)}
                  {getStatusLabel(asset.status)}
                </span>
              }
            />
            <InfoCard 
              icon={<MapPin className="w-5 h-5" />}
              label="Location" 
              value={asset.current_location || 'Not set'} 
            />
            <InfoCard
              icon={<Calendar className="w-5 h-5" />}
              label="Purchase Date"
              value={asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : 'N/A'}
            />
          </div>

          {asset.purchase_price && (
            <div className="bg-[#00252b] rounded-lg p-4 mt-4">
              <h3 className="font-semibold text-white mb-2">Purchase Price</h3>
              <p className="text-3xl font-bold text-[#f26f00]">
                €{asset.purchase_price.toLocaleString()}
              </p>
            </div>
          )}

          {asset.description && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
              <h3 className="font-semibold text-[#00252b] mb-2">Description</h3>
              <p className="text-gray-700 text-sm">{asset.description}</p>
            </div>
          )}
        </div>

        {/* Quick Status Update - Command Section Pattern: Top + Right Border */}
        <div className="bg-gray-50 rounded-lg shadow-md border-t-[5px] border-r-[5px] border-[#f26f00] p-6 mb-6">
          <h2 className="text-xl font-bold text-[#00252b] mb-4">Quick Status Update</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleStatusUpdate('available')}
              disabled={updating || selectedStatus === 'available'}
              className={`p-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${getStatusButtonClass('available', selectedStatus === 'available')} disabled:opacity-50`}
              style={{ minHeight: '48px' }}
            >
              <CheckCircle className="w-5 h-5" />
              Available
            </button>
            <button
              onClick={() => handleStatusUpdate('in_use')}
              disabled={updating || selectedStatus === 'in_use'}
              className={`p-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${getStatusButtonClass('in_use', selectedStatus === 'in_use')} disabled:opacity-50`}
              style={{ minHeight: '48px' }}
            >
              <Package className="w-5 h-5" />
              In Use
            </button>
            <button
              onClick={() => handleStatusUpdate('maintenance')}
              disabled={updating || selectedStatus === 'maintenance'}
              className={`p-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${getStatusButtonClass('maintenance', selectedStatus === 'maintenance')} disabled:opacity-50`}
              style={{ minHeight: '48px' }}
            >
              <Wrench className="w-5 h-5" />
              Maintenance
            </button>
            <button
              onClick={() => handleStatusUpdate('out_of_service')}
              disabled={updating || selectedStatus === 'out_of_service'}
              className={`p-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${getStatusButtonClass('out_of_service', selectedStatus === 'out_of_service')} disabled:opacity-50`}
              style={{ minHeight: '48px' }}
            >
              <CircleSlash className="w-5 h-5" />
              Out of Service
            </button>
          </div>
        </div>

        {/* Location Update */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-[#00252b] flex items-center gap-2">
              <MapPin className="w-6 h-6 text-[#f26f00]" />
              Update Location
            </h2>
            {!showLocationForm && (
              <button
                onClick={() => setShowLocationForm(true)}
                className="px-4 py-2 bg-[#f26f00] text-white rounded-lg hover:bg-[#d96200] font-semibold transition-all"
              >
                Update
              </button>
            )}
          </div>

          {showLocationForm && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#00252b] mb-2">
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Enter location"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00] font-medium"
                  style={{ fontSize: '16px' }}
                  maxLength={255}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#00252b] mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00]"
                  style={{ fontSize: '16px' }}
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-gray-600 mt-1 font-medium">{notes.length}/500</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleUseMyLocation}
                  disabled={updating}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold disabled:opacity-50 min-h-[48px] flex items-center justify-center gap-2"
                >
                  <Navigation className="w-5 h-5" />
                  Use GPS
                </button>
                <button
                  onClick={handleLocationUpdate}
                  disabled={updating || !location.trim()}
                  className="flex-1 px-4 py-3 bg-[#f26f00] text-white rounded-lg hover:bg-[#d96200] font-bold disabled:opacity-50 min-h-[48px]"
                >
                  {updating ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setShowLocationForm(false)
                    setLocation('')
                    setNotes('')
                  }}
                  disabled={updating}
                  className="px-4 py-3 bg-white text-[#00252b] border-2 border-[#00252b] rounded-lg hover:bg-[#00252b] hover:text-white font-bold disabled:opacity-50 min-h-[48px] transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Last Scanned - Status Card Pattern */}
        {asset.last_seen_at && (
          <div className="bg-white rounded-lg shadow-md border-l-4 border-b-4 border-gray-400 p-6 mb-6">
            <h2 className="text-xl font-bold text-[#00252b] mb-4 flex items-center gap-2">
              <Clock className="w-6 h-6 text-gray-600" />
              Last Scanned
            </h2>
            <div className="space-y-2">
              <p className="text-gray-800 font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-600" />
                <span className="font-bold">When:</span> {formatTimeSince(asset.last_seen_at)}
              </p>
              {asset.current_location && (
                <p className="text-gray-800 font-medium flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-600" />
                  <span className="font-bold">Location:</span> {asset.current_location}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-6 space-y-2">
          <p className="text-xs text-gray-600 font-medium">Asset ID: {asset.id.substring(0, 8)}...</p>
          <p className="text-xs text-gray-600 font-medium">
            Scanned at {new Date().toLocaleString()}
          </p>
          <p className="text-sm text-[#00252b] mt-4 font-semibold">
            Powered by <span className="text-[#f26f00]">TraviXO</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-gray-600">{icon}</span>}
        <p className="text-xs text-gray-600 font-bold uppercase tracking-wide">{label}</p>
      </div>
      <div className="font-bold text-[#00252b]">
        {typeof value === 'string' ? value : value}
      </div>
    </div>
  )
}