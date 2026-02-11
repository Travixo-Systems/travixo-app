import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { asset_id, client_name, client_contact, expected_return_date, notes, latitude, longitude } = body

    if (!asset_id || !client_name?.trim()) {
      return NextResponse.json(
        { error: 'asset_id and client_name are required' },
        { status: 400 }
      )
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(asset_id)) {
      return NextResponse.json({ error: 'invalid asset_id format' }, { status: 400 })
    }

    // Get user's org
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'no_organization' }, { status: 403 })
    }

    // Call RPC
    const { data, error } = await supabase.rpc('checkout_asset', {
      p_asset_id: asset_id,
      p_organization_id: userData.organization_id,
      p_user_id: user.id,
      p_client_name: client_name.trim(),
      p_client_contact: client_contact?.trim() || null,
      p_expected_return_date: expected_return_date || null,
      p_checkout_notes: notes?.trim() || null,
      p_location_name: null,
      p_latitude: latitude || null,
      p_longitude: longitude || null,
    })

    if (error) {
      console.error('Checkout RPC error:', error)
      return NextResponse.json({ error: 'checkout_failed' }, { status: 500 })
    }

    if (!data?.success) {
      const errMsg = data?.error || 'checkout_failed'
      const statusMap: Record<string, number> = {
        asset_not_found: 404,
        already_rented: 409,
        vgp_blocked: 403,
      }
      return NextResponse.json(
        { error: errMsg },
        { status: statusMap[errMsg] || 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
