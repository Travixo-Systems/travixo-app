import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (_) {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (_) {}
        },
      },
    }
  );
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile?.organization_id) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 403 }
      );
    }

    const { data: inspections, error } = await supabase
      .from('vgp_inspections')
      .select(`
        id,
        inspection_date,
        inspector_name,
        inspector_company,
        result,
        certificate_url,
        next_inspection_date,
        organization_id,
        assets (
          id,
          name,
          serial_number,
          asset_categories ( name )
        )
      `)
      .eq('organization_id', profile.organization_id)
      .order('inspection_date', { ascending: false });

    if (error) {
      console.error('History fetch error:', error);
      throw error;
    }

    const formattedInspections = (inspections || []).map((i: any) => ({
      id: i.id,
      asset_name: i.assets?.name || 'N/A',
      asset_serial: i.assets?.serial_number || 'N/A',
      asset_category: i.assets?.asset_categories?.name || 'N/A',
      inspection_date: i.inspection_date,
      inspector_name: i.inspector_name,
      inspector_company: i.inspector_company,
      result: i.result,
      certificate_url: i.certificate_url,
      next_inspection_date: i.next_inspection_date
    }));

    return NextResponse.json({ inspections: formattedInspections });
  } catch (error: any) {
    console.error('Error fetching inspections:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch inspections' },
      { status: 500 }
    );
  }
}