import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/clients/[id] - Get a single client with rental history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'no_organization' }, { status: 403 })
    }

    // Fetch client
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('organization_id', userData.organization_id)
      .single()

    if (error || !client) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // Full rental history for this client, newest first, with asset details.
    const { data: rentals } = await supabase
      .from('rentals')
      .select(`
        id,
        asset_id,
        client_name,
        checkout_date,
        expected_return_date,
        actual_return_date,
        return_condition,
        status,
        assets ( name, serial_number, qr_code )
      `)
      .eq('client_id', id)
      .eq('organization_id', userData.organization_id)
      .order('checkout_date', { ascending: false })
      .limit(200) as { data: RentalWithAsset[] | null }

    const allRentals = rentals || []
    const activeRentals = allRentals.filter((r) => r.status === 'active')

    // VGP deadlines for the assets this client currently holds. This is the
    // compliance signal that makes the client page actionable: equipment out
    // with a client whose VGP is due is a legal risk for the rental company.
    const activeAssetIds = [...new Set(activeRentals.map((r) => r.asset_id))]
    const vgpByAsset = new Map<string, string>()

    if (activeAssetIds.length > 0) {
      const { data: schedules } = await supabase
        .from('vgp_schedules')
        .select('asset_id, next_due_date')
        .eq('organization_id', userData.organization_id)
        .eq('status', 'active')
        .is('archived_at', null)
        .in('asset_id', activeAssetIds)

      for (const s of schedules || []) {
        const existing = vgpByAsset.get(s.asset_id)
        if (!existing || s.next_due_date < existing) {
          vgpByAsset.set(s.asset_id, s.next_due_date)
        }
      }
    }

    const decorate = (r: RentalWithAsset) => ({
      id: r.id,
      asset_id: r.asset_id,
      asset_name: r.assets?.name || null,
      serial_number: r.assets?.serial_number || null,
      checkout_date: r.checkout_date,
      expected_return_date: r.expected_return_date,
      actual_return_date: r.actual_return_date,
      return_condition: r.return_condition,
      status: r.status,
      vgp_due_date: vgpByAsset.get(r.asset_id) || null,
    })

    return NextResponse.json({
      client,
      active_rentals: activeRentals.map(decorate),
      past_rentals: allRentals.filter((r) => r.status !== 'active').map(decorate),
      total_rentals: allRentals.length,
    })
  } catch (error) {
    console.error('Client fetch error:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

// PATCH /api/clients/[id] - Update a client
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'no_organization' }, { status: 403 })
    }

    const body = await request.json()
    const updates: Record<string, string | null> = {}

    if (body.name !== undefined) {
      if (!body.name?.trim()) {
        return NextResponse.json({ error: 'name_required' }, { status: 400 })
      }
      updates.name = body.name.trim()
    }
    if (body.email !== undefined) updates.email = body.email?.trim() || null
    if (body.phone !== undefined) updates.phone = body.phone?.trim() || null
    if (body.company !== undefined) updates.company = body.company?.trim() || null
    if (body.address !== undefined) updates.address = body.address?.trim() || null
    if (body.notes !== undefined) updates.notes = body.notes?.trim() || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'no_updates' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('clients')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', userData.organization_id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'client_exists' }, { status: 409 })
      }
      console.error('Client update error:', error)
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Client update API error:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

interface RentalWithAsset {
  id: string
  asset_id: string
  client_name: string
  checkout_date: string
  expected_return_date: string | null
  actual_return_date: string | null
  return_condition: string | null
  status: string
  assets: { name: string; serial_number: string | null; qr_code: string | null } | null
}
