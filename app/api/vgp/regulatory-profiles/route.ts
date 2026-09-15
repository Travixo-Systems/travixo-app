// app/api/vgp/regulatory-profiles/route.ts
//
// Replaces app/api/vgp/equipment-types/route.ts. The table behind it was
// renamed by 20260914120000_vgp_regulatory_profiles.sql.
//
// This endpoint only LISTS the catalogue. It deliberately offers no lookup by
// asset or category: the fitted configuration decides which regime applies --
// a telescopic handler is a forklift with forks, a PEMP with a basket, a crane
// with a jib and an earthmoving machine with a bucket -- so the profile is
// chosen by the user, never inferred from asset_categories.
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('vgp_regulatory_profiles')
      .select(
        'id, code, name, default_interval_months, regulatory_reference, ' +
        'usage_condition, classification_status, source_url, description'
      )
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    // The rows are the same for every tenant, but the response stays behind
    // the vgp_compliance gate, so it must not go into a shared cache: a CDN
    // hit would serve this to an org whose plan does not include VGP.
    // `private` keeps it in the requesting browser only, which still removes
    // the repeat fetches within a session -- and with them the three-call auth
    // preamble each one drags along.
    return NextResponse.json(
      { regulatory_profiles: data ?? [] },
      { headers: { 'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('VGP Regulatory Profiles GET Error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
