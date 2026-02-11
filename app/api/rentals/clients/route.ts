import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''

    // Get user's org
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!userData?.organization_id) {
      return NextResponse.json({ clients: [] })
    }

    if (query.length < 2) {
      return NextResponse.json({ clients: [] })
    }

    // Fetch distinct client names matching the search
    const { data, error } = await supabase
      .from('rentals')
      .select('client_name')
      .eq('organization_id', userData.organization_id)
      .ilike('client_name', `%${query}%`)
      .order('checkout_date', { ascending: false })
      .limit(20)

    if (error) {
      console.error('Client search error:', error)
      return NextResponse.json({ clients: [] })
    }

    // Deduplicate
    const uniqueClients = [...new Set((data || []).map(r => r.client_name))]

    return NextResponse.json({ clients: uniqueClients.slice(0, 10) })
  } catch (error) {
    console.error('Client search error:', error)
    return NextResponse.json({ clients: [] })
  }
}
