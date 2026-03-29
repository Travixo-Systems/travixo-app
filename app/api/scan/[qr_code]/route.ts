import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface Params {
  params: Promise<{ qr_code: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { qr_code } = await params

    if (!qr_code?.trim()) {
      return NextResponse.json({ error: 'qr_code is required' }, { status: 400 })
    }

    const supabase = await createClient()

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
      return NextResponse.json({ error: 'asset_not_found' }, { status: 404 })
    }

    return NextResponse.json({ asset: data })
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
