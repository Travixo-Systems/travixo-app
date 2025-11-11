import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { format } from 'date-fns';

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
        { error: 'No organization' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const result = searchParams.get('result');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    let query = supabase
      .from('vgp_inspections')
      .select(`
        id,
        inspection_date,
        inspector_name,
        inspector_company,
        result,
        certificate_url,
        next_inspection_date,
        findings,
        certification_number,
        assets (
          name,
          serial_number,
          asset_categories ( name )
        )
      `)
      .eq('organization_id', profile.organization_id);

    if (result && result !== 'all') {
      query = query.eq('result', result);
    }

    if (startDate) {
      query = query.gte('inspection_date', startDate);
    }

    if (endDate) {
      query = query.lte('inspection_date', endDate);
    }

    const { data: inspections, error } = await query.order('inspection_date', { ascending: false });

    if (error) throw error;

    let filtered = inspections || [];
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((i: any) => 
        (i.assets?.name || '').toLowerCase().includes(searchLower) ||
        i.inspector_name.toLowerCase().includes(searchLower)
      );
    }

    const headers = [
      'Équipement',
      'Catégorie',
      'Numéro de série',
      'Date inspection',
      'Inspecteur',
      'Société',
      'Résultat',
      'N° Certificat',
      'Certificat URL',
      'Prochaine inspection',
      'Observations'
    ];

    const resultLabels = {
      passed: 'Conforme',
      conditional: 'Conditionnel',
      failed: 'Non Conforme'
    };

    const rows = filtered.map((i: any) => [
      i.assets?.name || '',
      i.assets?.asset_categories?.name || '',
      i.assets?.serial_number || '',
      format(new Date(i.inspection_date), 'dd/MM/yyyy'),
      i.inspector_name,
      i.inspector_company,
      resultLabels[i.result as keyof typeof resultLabels],
      i.certification_number || '',
      i.certificate_url || '',
      format(new Date(i.next_inspection_date), 'dd/MM/yyyy'),
      i.findings || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Add UTF-8 BOM for Excel compatibility
    const bom = '\uFEFF';
    const csvWithBom = bom + csv;

    return new NextResponse(csvWithBom, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="inspections_vgp_${format(new Date(), 'yyyy-MM-dd')}.csv"`
      }
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: error?.message || 'Export failed' },
      { status: 500 }
    );
  }
}