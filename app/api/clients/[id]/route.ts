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

    // Fetch active rentals for this client
    const { data: activeRentals } = await supabase
      .from('rentals')
      .select('id, asset_id, client_name, checkout_date, expected_return_date, status')
      .eq('client_id', id)
      .eq('status', 'active')
      .order('checkout_date', { ascending: false })

    // Count total rentals
    const { count: totalRentals } = await supabase
      .from('rentals')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', id)

    return NextResponse.json({
      client,
      active_rentals: activeRentals || [],
      total_rentals: totalRentals || 0,
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
