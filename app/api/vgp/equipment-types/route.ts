// app/api/vgp/equipment-types/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requireFeature } from '@/lib/server/require-feature';

export async function GET() {
  try {
    const supabase = await createClient();

    // Feature gate: require vgp_compliance (also handles auth + org lookup)
    const { denied } = await requireFeature(supabase, 'vgp_compliance');
    if (denied) return denied;

    const { data, error } = await supabase
      .from('vgp_equipment_types')
      .select('*')
      .order('category', { ascending: true })
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
      { equipment_types: data },
      { headers: { 'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400' } }
    );
  } catch (error: any) {
    console.error('VGP Equipment Types GET Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
