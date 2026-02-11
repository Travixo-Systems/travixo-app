import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/clients - List clients for the user's org
export async function GET(request: NextRequest) {
  try {
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

    const searchParams = request.nextUrl.searchParams
    const q = searchParams.get('q')?.trim()
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    let query = supabase
      .from('clients')
      .select('id, name, email, phone, company, notes, created_at, updated_at')
      .eq('organization_id', userData.organization_id)
      .order('name', { ascending: true })
      .limit(limit)

    if (q) {
      query = query.ilike('name', `%${q}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Clients fetch error:', error)
      return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
    }

    return NextResponse.json({ clients: data || [] })
  } catch (error) {
    console.error('Clients API error:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

// POST /api/clients - Create a new client
export async function POST(request: NextRequest) {
  try {
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
    const { name, email, phone, company, address, notes } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name_required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('clients')
      .insert({
        organization_id: userData.organization_id,
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        company: company?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'client_exists' }, { status: 409 })
      }
      console.error('Client create error:', error)
      return NextResponse.json({ error: 'create_failed' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Client create API error:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
