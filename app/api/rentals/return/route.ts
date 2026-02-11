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
    const { rental_id, return_condition, return_notes, location, latitude, longitude } = body

    if (!rental_id) {
      return NextResponse.json({ error: 'rental_id is required' }, { status: 400 })
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(rental_id)) {
      return NextResponse.json({ error: 'invalid rental_id format' }, { status: 400 })
    }

    // Validate return_condition if provided
    if (return_condition && !['good', 'fair', 'damaged'].includes(return_condition)) {
      return NextResponse.json({ error: 'invalid return_condition' }, { status: 400 })
    }

    // Call RPC
    const { data, error } = await supabase.rpc('return_asset', {
      p_rental_id: rental_id,
      p_user_id: user.id,
      p_return_condition: return_condition || null,
      p_return_notes: return_notes?.trim() || null,
      p_location_name: location?.trim() || null,
      p_latitude: latitude || null,
      p_longitude: longitude || null,
    })

    if (error) {
      console.error('Return RPC error:', error)
      return NextResponse.json({ error: 'return_failed' }, { status: 500 })
    }

    if (!data?.success) {
      const errMsg = data?.error || 'return_failed'
      const statusMap: Record<string, number> = {
        rental_not_found: 404,
      }
      return NextResponse.json(
        { error: errMsg },
        { status: statusMap[errMsg] || 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Return error:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
