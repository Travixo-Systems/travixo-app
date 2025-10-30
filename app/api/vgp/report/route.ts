// app/api/vgp/report/route.ts

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { generateVGPReport } from '@/lib/pdf-generator';

const INSPECTION_FIELDS = `
  id,
  inspection_date,
  inspector_name,
  inspector_company,
  certification_number,
  result,
  next_inspection_date,
  certificate_url,
  organization_id,
  assets (
    id,
    name,
    serial_number,
    asset_categories ( name )
  ),
  organizations (
    name
  )
`;

function formatFR(dateIso: string) {
  // dateIso = '2025-10-30'
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return dateIso;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

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

// ------------------ POST = PDF ------------------
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // org du user
    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile?.organization_id) {
      return NextResponse.json(
        { error: "Impossible de déterminer l'organisation de l'utilisateur" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { start_date, end_date } = body as { start_date?: string; end_date?: string };

    if (!start_date || !end_date) {
      return NextResponse.json(
        { error: 'start_date and end_date are required' },
        { status: 400 }
      );
    }

    // inspections de l’org sur la période
    const { data: inspections, error: inspectionsError } = await supabase
      .from('vgp_inspections')
      .select(INSPECTION_FIELDS)
      .eq('organization_id', profile.organization_id)
      .gte('inspection_date', start_date)
      .lte('inspection_date', end_date)
      .order('inspection_date', { ascending: false });

    if (inspectionsError) {
      console.error('VGP Report POST: Error fetching inspections', inspectionsError);
      return NextResponse.json(
        { error: 'Erreur lors de la récupération des inspections' },
        { status: 500 }
      );
    }

    if (!inspections || inspections.length === 0) {
      return NextResponse.json(
        { error: `Aucune inspection trouvée entre ${start_date} et ${end_date}` },
        { status: 404 }
      );
    }

    // priorité 1: org via jointure sur l’inspection
    let orgName = (inspections[0] as any).organizations?.name as string | undefined;

    // priorité 2: si pas trouvé, on tente la table organizations (name only)
    if (!orgName) {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', profile.organization_id)
        .maybeSingle();
      if (orgRow?.name) {
        orgName = orgRow.name;
      }
    }

    const orgInfo = {
      name: orgName || 'Organisation',
      address: '',
      city: '',
      postal_code: '',
      siret: '',
    };

    // stats
    const passed = inspections.filter((i) => i.result === 'passed').length;
    const conditional = inspections.filter((i) => i.result === 'conditional').length;
    const failed = inspections.filter((i) => i.result === 'failed').length;
    const uniqueAssets = new Set(
      inspections.map((i: any) => i.assets?.id).filter((x: string | undefined) => !!x)
    );

    const todayIso = new Date().toISOString().split('T')[0];
    const { data: overdueSchedules } = await supabase
      .from('vgp_schedules')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .lt('next_due_date', todayIso);

    const summary = {
      total_assets: uniqueAssets.size,
      total_inspections: inspections.length,
      passed,
      conditional,
      failed,
      compliance_rate:
        inspections.length > 0 ? ((passed + conditional) / inspections.length) * 100 : 0,
      overdue_count: overdueSchedules?.length || 0,
    };

    // on formate ici pour que le PDF ait de vraies dates FR
    const reportData = {
      organization: orgInfo,
      period: {
        start_date: formatFR(start_date),
        end_date: formatFR(end_date),
      },
      inspections: inspections as any,
      summary,
      generated_at: formatFR(todayIso),
    };

    const pdf = generateVGPReport(reportData);
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="rapport-vgp-direccte-${start_date}-${end_date}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('VGP Report POST: Error', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}

// ------------------ GET ------------------
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
        { error: "Impossible de déterminer l'organisation de l'utilisateur" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    // mode preview
    if (startDate && endDate) {
      const { data: inspections, error } = await supabase
        .from('vgp_inspections')
        .select(INSPECTION_FIELDS)
        .eq('organization_id', profile.organization_id)
        .gte('inspection_date', startDate)
        .lte('inspection_date', endDate)
        .order('inspection_date', { ascending: false });

      if (error) {
        console.error('VGP Report GET: Error fetching inspections', error);
        return NextResponse.json(
          { error: 'Erreur lors de la récupération des inspections' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        inspections: inspections || [],
      });
    }

    // mode date range
    const { data: dates, error: datesErr } = await supabase
      .from('vgp_inspections')
      .select('inspection_date')
      .eq('organization_id', profile.organization_id)
      .order('inspection_date', { ascending: true });

    if (datesErr) {
      console.error('VGP Report GET: Error fetching dates', datesErr);
      return NextResponse.json({ error: 'Erreur lors de la récupération des dates' }, { status: 500 });
    }

    if (!dates || dates.length === 0) {
      return NextResponse.json({
        earliest_date: null,
        latest_date: null,
        total_inspections: 0,
      });
    }

    return NextResponse.json({
      earliest_date: dates[0].inspection_date,
      latest_date: dates[dates.length - 1].inspection_date,
      total_inspections: dates.length,
    });
  } catch (error: any) {
    console.error('VGP Report GET: Error', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
