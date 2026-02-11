// GET /api/health — Lightweight health check for UptimeRobot / uptime monitors.
// Returns 200 if the app is running and Supabase is reachable.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const start = Date.now()

  // Quick DB ping — single-row query to confirm Supabase is reachable
  let dbOk = false
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error } = await supabase.from('organizations').select('id').limit(1)
    dbOk = !error
  } catch {
    dbOk = false
  }

  const latencyMs = Date.now() - start

  if (!dbOk) {
    return NextResponse.json(
      { status: 'degraded', db: false, latencyMs },
      { status: 503 }
    )
  }

  return NextResponse.json(
    { status: 'ok', db: true, latencyMs },
    { status: 200 }
  )
}
