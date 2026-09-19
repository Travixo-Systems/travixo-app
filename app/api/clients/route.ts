import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireWriteAccess } from '@/lib/server/require-write-access'

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

    // Search goes through search_clients. The previous implementation built a
    // PostgREST .or() filter by DELETING %, _, comma and parentheses from the
    // query instead of escaping them, so "TP_Loc" became "TPLoc" and matched
    // nothing, a query of only special characters stripped to '' and silently
    // returned the entire unfiltered list, and accents never matched. It also
    // searched name and company only, while the card renders email and phone.
    //
    // The RPC folds accents, escapes LIKE metacharacters literally, searches
    // all five fields from spec section 11, and derives the tenant from RLS
    // rather than a parameter.
    //
    // total_count is returned so the caller can tell "100 shown" from "100 of
    // 340 matched" -- the old route capped at 100 with no way to know.
    const { data: searched, error } = await supabase.rpc('search_clients', {
      p_query: q || null,
      p_limit: limit,
      p_offset: Math.max(0, parseInt(searchParams.get('offset') || '0')),
    })

    if (error) {
      console.error('Clients search error:', error)
      return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
    }

    // Reshape to the contract the callers already expect. The RPC orders by
    // created_at (newest first, the generator's default); this list has always
    // read alphabetically, so it is sorted here over the returned page.
    const data = (searched || [])
      .map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        company: c.company,
        notes: c.notes,
        created_at: c.created_at,
        updated_at: c.created_at,
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'))

    const totalCount = (searched || []).length > 0
      ? Number((searched as { total_count: number }[])[0].total_count)
      : 0

    const clients = data || []

    if (clients.length === 0) {
      return NextResponse.json({ clients: [], total_count: totalCount })
    }

    // Attach active-rental counts and the soonest VGP deadline among the
    // equipment each client currently holds. This is what makes the clients
    // list operationally useful rather than a static address book.
    const clientIds = clients.map((c) => c.id)

    const { data: activeRentals } = await supabase
      .from('rentals')
      .select('client_id, asset_id, expected_return_date')
      .eq('organization_id', userData.organization_id)
      .eq('status', 'active')
      .in('client_id', clientIds)

    const rentalsByClient = new Map<string, { assetIds: string[]; overdue: number }>()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const r of activeRentals || []) {
      if (!r.client_id) continue
      const entry = rentalsByClient.get(r.client_id) || { assetIds: [], overdue: 0 }
      entry.assetIds.push(r.asset_id)
      if (r.expected_return_date && new Date(r.expected_return_date) < today) {
        entry.overdue++
      }
      rentalsByClient.set(r.client_id, entry)
    }

    // Soonest VGP due date across all rented-out assets, per client.
    const rentedAssetIds = [...new Set((activeRentals || []).map((r) => r.asset_id))]
    const vgpByAsset = new Map<string, string>()

    if (rentedAssetIds.length > 0) {
      const { data: schedules } = await supabase
        .from('vgp_schedules')
        .select('asset_id, next_due_date')
        .eq('organization_id', userData.organization_id)
        .eq('status', 'active')
        .is('archived_at', null)
        .in('asset_id', rentedAssetIds)

      for (const s of schedules || []) {
        const existing = vgpByAsset.get(s.asset_id)
        if (!existing || s.next_due_date < existing) {
          vgpByAsset.set(s.asset_id, s.next_due_date)
        }
      }
    }

    const enriched = clients.map((c) => {
      const entry = rentalsByClient.get(c.id)
      let soonestVgpDue: string | null = null

      for (const assetId of entry?.assetIds || []) {
        const due = vgpByAsset.get(assetId)
        if (due && (!soonestVgpDue || due < soonestVgpDue)) {
          soonestVgpDue = due
        }
      }

      return {
        ...c,
        active_rental_count: entry?.assetIds.length || 0,
        overdue_rental_count: entry?.overdue || 0,
        soonest_vgp_due: soonestVgpDue,
      }
    })

    return NextResponse.json({ clients: enriched, total_count: totalCount })
  } catch (error) {
    console.error('Clients API error:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

// POST /api/clients - Create a new client
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Refuse mutations once the pilot has expired. The whole app becomes
    // read-only at day 30 - see lib/billing/access-model.ts.
    const writeGate = await requireWriteAccess(supabase)
    if (writeGate.denied) return writeGate.denied

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
