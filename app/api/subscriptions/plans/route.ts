// app/api/subscriptions/plans/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * Public pricing. Identical bytes for every caller, signed in or not.
 *
 * This route deliberately does NOT use lib/supabase/server.ts. That client
 * binds cookies() and headers(), which makes the route dynamic even though the
 * cookie is never read -- so every visitor reached the origin for a table that
 * changes when someone edits pricing, which is to say almost never.
 *
 * A plain anon client has no per-request input, which lets the response be
 * cached at the edge. RLS still applies: subscription_plans is readable by
 * anon precisely because it is public pricing.
 */

// One hour fresh, one day of stale-while-revalidate. A pricing change is
// visible within the hour without a deploy; if the origin is down, the CDN
// keeps serving yesterday's prices rather than an error.
const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

export const revalidate = 3600;

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: plans, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('display_order');

    if (error) {
      console.error('Failed to fetch plans:', error);
      // Never cache a failure: a transient blip would otherwise be pinned at
      // the edge for an hour.
      return NextResponse.json(
        { error: 'Failed to fetch plans' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { plans },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );

  } catch (error) {
    console.error('Plans API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
