import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Service-role client for the parts of a scan that must work for LOGGED-OUT
// users. assets/scans are RLS-protected and no longer carry a public policy
// (see 20260820_drop_permissive_public_policies.sql), so the anon-key client
// cannot read the asset or stamp last_seen_* on an anonymous scan.
//
// This route does its own authorization first -- status/location updates
// require a session and same-org membership (see the auth check below) --
// so the elevated client is only used AFTER those checks have passed.
function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// POST /api/scan/update
// OPTION 2 SECURITY: Requires authentication for status/location updates
// Public scan logging still allowed (for automatic GPS tracking)
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
    // Elevated client, used only after this route's own authorization checks.
    // Needed because the asset read, the last_seen stamp and the scan log all
    // have to work for logged-out scanners, and those tables are now RLS'd
    // with no public policy.
    const db = serviceClient()

    // Try to get authenticated user (non-blocking — public scans still work)
    const { data: { user } } = await supabase.auth.getUser()
    const scannedByUserId = user?.id ?? null

    // OPTION 2 AUTH CHECK: Status or Location updates require authentication
    const isUpdateRequest = status || location

    if (isUpdateRequest) {
      if (!user) {
        return NextResponse.json(
          { success: false, message: 'Authentication required to update asset status or location' },
          { status: 401 }
        )
      }

      // Verify user belongs to the same organization as the asset
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      // Read the target org with the elevated client so this compares two
      // real values. With the session client, a cross-org asset comes back
      // as null and the check below would be passing only because
      // `orgId !== undefined` happens to be true -- and it would wrongly
      // ALLOW the update if both sides were ever undefined.
      const { data: assetData } = await db
        .from('assets')
        .select('organization_id')
        .eq('id', asset_id)
        .single()

      if (
        !userData?.organization_id ||
        !assetData?.organization_id ||
        userData.organization_id !== assetData.organization_id
      ) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: Cannot update assets from another organization' },
          { status: 403 }
        )
      }
    }

    // STEP 1: Verify asset exists and QR code matches
    // Elevated: anonymous scanners have no read access to assets.
    const { data: asset, error: assetError } = await db
      .from('assets')
      .select('id, name, qr_code, organization_id, status, current_location, last_seen_at, last_seen_by, archived_at')
      .eq('id', asset_id)
      .eq('qr_code', qr_code)
      .single()

    if (assetError || !asset) {
      return NextResponse.json(
        { success: false, message: 'Asset not found or QR code mismatch' },
        { status: 404 }
      )
    }

    // Prevent updates to archived/retired assets
    if (asset.archived_at && isUpdateRequest) {
      return NextResponse.json(
        { success: false, message: 'Cannot update archived/retired asset' },
        { status: 403 }
      )
    }

    // Store old status for change tracking
    const oldStatus = asset.status

    // STEP 2: Prepare asset updates
    const assetUpdates: any = {
      last_seen_at: new Date().toISOString(),
    }

    assetUpdates.last_seen_by = scannedByUserId

    if (location) {
      assetUpdates.current_location = location.trim().substring(0, 255)
    }

    if (status) {
      assetUpdates.status = status
    }

    assetUpdates.updated_at = new Date().toISOString()

    // STEP 3: Update asset
    // Elevated: an anonymous scan still stamps last_seen_at/last_seen_by.
    // Status/location changes were already gated by the auth + same-org
    // check above, so this cannot be used to write across tenants.
    const { data: updatedAsset, error: updateError } = await db
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

    // STEP 4: Create scan record
    const scanRecord: any = {
      asset_id: asset_id,
      scanned_at: new Date().toISOString(),
      location_name: location?.trim().substring(0, 255) || null,
      notes: notes?.trim().substring(0, 500) || null,
      scanned_by: scannedByUserId,
      latitude: latitude || null,
      longitude: longitude || null,
      scan_type: 'check',
    }

    // Elevated: public QR scan logging must work for logged-out users.
    const { data: scan, error: scanError } = await db
      .from('scans')
      .insert(scanRecord)
      .select('id, scanned_at, location_name, notes, scanned_by')
      .single()

    if (scanError) {
      console.error('Error creating scan record:', scanError)
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