// app/api/vgp/inspections/route.ts
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
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    }
  );
}

/**
 * GET /api/vgp/inspections
 * Optional query params:
 *   ?asset_id=xxx
 *   ?schedule_id=xxx
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const asset_id = searchParams.get('asset_id');
    const schedule_id = searchParams.get('schedule_id');

    let query = supabase
      .from('vgp_inspections')
      .select(`
        *,
        assets (
          id,
          name,
          serial_number,
          asset_categories (
            name
          ),
          current_location
        ),
        vgp_schedules (
          id,
          interval_months,
          status
        )
      `)
      .eq('organization_id', userData.organization_id)
      .order('inspection_date', { ascending: false });

    if (asset_id) query = query.eq('asset_id', asset_id);
    if (schedule_id) query = query.eq('schedule_id', schedule_id);

    const { data, error } = await query;

    if (error) {
      console.error('Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ inspections: data || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/vgp/inspections:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/vgp/inspections
 * Creates a new inspection and updates the schedule if provided
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      asset_id,
      schedule_id,
      inspection_date,
      inspector_name,
      inspector_company,
      certification_number,
      result,
      findings,
      interval_months,
      certificate_url,
      certificate_file_name,
    } = body;

    // Validate required fields
    if (!asset_id || !inspection_date || !inspector_name || !result) {
      return NextResponse.json(
        { error: 'Missing required fields: asset_id, inspection_date, inspector_name, result' },
        { status: 400 }
      );
    }

    const validResults = ['passed', 'conditional', 'failed'];
    if (!validResults.includes(result)) {
      return NextResponse.json(
        { error: `Invalid result value. Must be one of: ${validResults.join(', ')}` },
        { status: 400 }
      );
    }

    // Calculate next inspection date
    const inspectionDateObj = new Date(inspection_date);
    const nextInspectionDate = new Date(inspectionDateObj);
    const monthsToAdd = Number(interval_months) || 12;
    nextInspectionDate.setMonth(nextInspectionDate.getMonth() + monthsToAdd);

    // Insert inspection
    const { data: inspection, error: insertError } = await supabase
      .from('vgp_inspections')
      .insert({
        asset_id,
        schedule_id: schedule_id || null,
        organization_id: userData.organization_id,
        inspection_date,
        inspector_name,
        inspector_company: inspector_company || null,
        certification_number: certification_number || null,
        result,
        findings: findings || null,
        next_inspection_date: nextInspectionDate.toISOString().split('T')[0],
        certificate_url: certificate_url || null,
        certificate_file_name: certificate_file_name || null,
        performed_by: user.id,
      })
      .select(`
        *,
        assets (
          id,
          name,
          serial_number
        )
      `)
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update schedule if needed
    if (schedule_id) {
      const scheduleUpdate: any = {
        last_inspection_date: inspection_date,
        next_due_date: nextInspectionDate.toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      };

      if (result === 'passed') {
        scheduleUpdate.status = 'active';
      } else if (result === 'failed') {
        scheduleUpdate.status = 'overdue';
      }

      const { error: updateError } = await supabase
        .from('vgp_schedules')
        .update(scheduleUpdate)
        .eq('id', schedule_id)
        .eq('organization_id', userData.organization_id);

      if (updateError) {
        console.error('Schedule update error:', updateError);
        // Do not fail the whole request if this fails
      }
    }

    return NextResponse.json(
      {
        inspection,
        message: 'Inspection recorded successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/vgp/inspections:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH and DELETE not yet implemented
 */
export async function PATCH() {
  return NextResponse.json({ error: 'PATCH not implemented' }, { status: 501 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'DELETE not implemented' }, { status: 501 });
}
