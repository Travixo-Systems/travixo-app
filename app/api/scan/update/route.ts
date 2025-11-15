import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/scan/update
// Purpose: Update asset location, status, and log scan
// Public endpoint (no auth required) - RLS policies protect data
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      asset_id,
      qr_code,
      location,
      status,
      notes,
      scanned_by,
      latitude,
      longitude,
    } = body

    // Validation
    if (!asset_id || !qr_code) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: asset_id and qr_code' },
        { status: 400 }
      )
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(asset_id)) {
      return NextResponse.json(
        { success: false, message: 'Invalid asset_id format' },
        { status: 400 }
      )
    }

    // Validate status if provided
    const validStatuses = ['available', 'in_use', 'maintenance', 'out_of_service']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // STEP 1: Verify asset exists and QR code matches
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('id, name, qr_code, organization_id, status, current_location, last_seen_at, last_seen_by')
      .eq('id', asset_id)
      .eq('qr_code', qr_code)
      .single()

    // DEBUG LOGGING
    console.log('=== SCAN UPDATE DEBUG ===')
    console.log('Looking for asset_id:', asset_id)
    console.log('Looking for qr_code:', qr_code)
    console.log('Query result - asset:', asset)
    console.log('Query result - error:', assetError)
    console.log('=========================')

    if (assetError || !asset) {
      return NextResponse.json(
        { success: false, message: 'Asset not found or QR code mismatch' },
        { status: 404 }
      )
    }

    // Store old status for change tracking
    const oldStatus = asset.status

    // STEP 2: Prepare asset updates
    const assetUpdates: any = {
      last_seen_at: new Date().toISOString(),
    }

    // Note: last_seen_by is UUID in database, set to null for public scans
    // In future, could create a system user UUID for "Public Scan"
    assetUpdates.last_seen_by = null

    if (location) {
      // No last_seen_location column, just update current_location
      assetUpdates.current_location = location.trim().substring(0, 255)
    }

    if (status) {
      assetUpdates.status = status
    }

    assetUpdates.updated_at = new Date().toISOString()

    // STEP 3: Update asset
    const { data: updatedAsset, error: updateError } = await supabase
      .from('assets')
      .update(assetUpdates)
      .eq('id', asset_id)
      .select('id, name, status, current_location, last_seen_at, last_seen_by')
      .single()

    if (updateError) {
      console.error('Error updating asset:', updateError)
      return NextResponse.json(
        { success: false, message: 'Failed to update asset' },
        { status: 500 }
      )
    }

    // STEP 4: Create scan record (match actual scans table schema)
    const scanRecord: any = {
      asset_id: asset_id,
      scanned_at: new Date().toISOString(),
      location_name: location?.trim().substring(0, 255) || null,
      notes: notes?.trim().substring(0, 500) || null,
      scanned_by: null, // UUID - null for public scans
      latitude: latitude || null,
      longitude: longitude || null,
      scan_type: 'check', // Default scan type
    }

    const { data: scan, error: scanError } = await supabase
      .from('scans')
      .insert(scanRecord)
      .select('id, scanned_at, location_name, notes, scanned_by')
      .single()

    if (scanError) {
      console.error('Error creating scan record:', scanError)
      // Asset update succeeded but scan logging failed - not critical
      // Return success anyway since main update worked
    }

    // STEP 5: Build response message
    let message = 'Asset updated successfully'
    const changes: string[] = []

    if (location) changes.push('location')
    if (status && status !== oldStatus) changes.push('status')
    if (notes) changes.push('notes')

    if (changes.length > 0) {
      message = `Updated ${changes.join(', ')}`
    }

    return NextResponse.json({
      success: true,
      message,
      asset: {
        id: updatedAsset.id,
        name: updatedAsset.name,
        status: updatedAsset.status,
        current_location: updatedAsset.current_location,
        last_seen_at: updatedAsset.last_seen_at,
        last_seen_by: updatedAsset.last_seen_by,
      },
      scan: scan ? {
        id: scan.id,
        scanned_at: scan.scanned_at,
        location_name: scan.location_name,
        notes: scan.notes,
        scanned_by: scan.scanned_by,
      } : null,
      status_changed: status && status !== oldStatus,
      old_status: oldStatus,
    })

  } catch (error) {
    console.error('Scan update error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}