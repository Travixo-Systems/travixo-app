// app/api/vgp/inspections/route.ts
// VGP Inspection Recording API - Handles inspection CRUD operations
// Supports UploadThing certificate uploads via certificate_url field

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { checkFeatureAccess } from '@/lib/billing/guard';

/**
 * Create authenticated Supabase client for server-side operations
 */
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
          } catch (error) {
            // Cookie setting can fail in middleware, ignore
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Cookie removal can fail in middleware, ignore
          }
        },
      },
    }
  );
}

/**
 * GET /api/vgp/inspections
 * Fetch inspection history with optional filters
 * 
 * Query Parameters:
 *   - asset_id: Filter by specific asset
 *   - schedule_id: Filter by specific schedule
 * 
 * Returns: Array of inspections with related asset and schedule data
 */
export async function GET(request: Request) {
  try {
    // Server-side feature gate: VGP requires Professional+ plan
    const denied = await checkFeatureAccess('vgp_compliance');
    if (denied) return denied;

    const supabase = await createClient();

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.log('VGP Inspections GET: Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      console.error('VGP Inspections GET: Organization not found');
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const asset_id = searchParams.get('asset_id');
    const schedule_id = searchParams.get('schedule_id');

    // Build query with filters
    let query = supabase
      .from('vgp_inspections')
      .select(`
        *,
        assets (
          id,
          name,
          serial_number,
          current_location,
          asset_categories (
            name
          )
        ),
        vgp_schedules (
          id,
          interval_months,
          status
        )
      `)
      .eq('organization_id', userData.organization_id)
      .order('inspection_date', { ascending: false });

    // Apply filters if provided
    if (asset_id) {
      query = query.eq('asset_id', asset_id);
    }
    if (schedule_id) {
      query = query.eq('schedule_id', schedule_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('VGP Inspections GET: Query error', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`VGP Inspections GET: Returned ${data?.length || 0} inspections`);
    return NextResponse.json({ inspections: data || [] });

  } catch (error: any) {
    console.error('VGP Inspections GET: Unexpected error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/vgp/inspections
 * Record a new VGP inspection
 * 
 * Request Body:
 *   - asset_id (required): Asset being inspected
 *   - inspection_date (required): Date inspection performed
 *   - inspector_name (required): Name of inspector
 *   - inspector_company: Inspection company name
 *   - certification_number: Certificate number
 *   - result (required): 'passed' | 'conditional' | 'failed'
 *   - findings: Inspection notes/observations
 *   - schedule_id: Related VGP schedule (optional)
 *   - interval_months: Months until next inspection
 *   - certificate_url: UploadThing file URL (from certificate upload)
 *   - certificate_file_name: Original filename of certificate
 * 
 * Side Effects:
 *   - Updates related VGP schedule if schedule_id provided
 *   - Marks asset out_of_service if result is 'failed'
 *   - Calculates next inspection date based on result
 * 
 * Result-Based Logic:
 *   - passed: Next inspection = normal interval
 *   - conditional: Next inspection = 6 months
 *   - failed: Next inspection = 30 days, asset marked out_of_service
 */
export async function POST(request: Request) {
  try {
    // Server-side feature gate: VGP requires Professional+ plan
    const denied = await checkFeatureAccess('vgp_compliance');
    if (denied) return denied;

    const supabase = await createClient();

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.log('VGP Inspections POST: Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      console.error('VGP Inspections POST: Organization not found');
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Parse request body
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
      certificate_url,        // UploadThing URL
      certificate_file_name,  // Original filename
    } = body;

    console.log('VGP Inspections POST: Creating inspection', {
      asset_id,
      schedule_id,
      result,
      has_certificate: !!certificate_url
    });

    // Validate required fields
    if (!asset_id || !inspection_date || !inspector_name || !result) {
      return NextResponse.json(
        { error: 'Missing required fields: asset_id, inspection_date, inspector_name, result' },
        { status: 400 }
      );
    }

    // Validate result value
    const validResults = ['passed', 'conditional', 'failed'];
    if (!validResults.includes(result)) {
      return NextResponse.json(
        { error: `Invalid result. Must be one of: ${validResults.join(', ')}` },
        { status: 400 }
      );
    }

    // Calculate next inspection date based on result
    const inspectionDateObj = new Date(inspection_date);
    const nextInspectionDate = new Date(inspectionDateObj);
    
    if (result === 'failed') {
      // Failed: Re-inspect in 30 days
      nextInspectionDate.setDate(nextInspectionDate.getDate() + 30);
    } else if (result === 'conditional') {
      // Conditional: Re-inspect in 6 months
      nextInspectionDate.setMonth(nextInspectionDate.getMonth() + 6);
    } else {
      // Passed: Use normal interval (default 12 months)
      const monthsToAdd = Number(interval_months) || 12;
      nextInspectionDate.setMonth(nextInspectionDate.getMonth() + monthsToAdd);
    }

    // Create inspection record
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
        certificate_url: certificate_url || null,          // UploadThing URL
        certificate_file_name: certificate_file_name || null, // Original filename
        performed_by: user.id,
      })
      .select(`
        *,
        assets (
          id,
          name,
          serial_number,
          current_location
        )
      `)
      .single();

    if (insertError) {
      console.error('VGP Inspections POST: Insert error', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log('VGP Inspections POST: Inspection created', inspection.id);

    // Update related VGP schedule if provided
    if (schedule_id) {
      const scheduleUpdate: any = {
        last_inspection_date: inspection_date,
        next_due_date: nextInspectionDate.toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      };

      // Update schedule status based on result
      if (result === 'passed' || result === 'conditional') {
        scheduleUpdate.status = 'completed';
      } else if (result === 'failed') {
        scheduleUpdate.status = 'failed';
      }

      const { error: updateError } = await supabase
        .from('vgp_schedules')
        .update(scheduleUpdate)
        .eq('id', schedule_id)
        .eq('organization_id', userData.organization_id);

      if (updateError) {
        console.error('VGP Inspections POST: Schedule update error', updateError);
        // Don't fail entire request if schedule update fails
      } else {
        console.log('VGP Inspections POST: Schedule updated', schedule_id);
      }
    }

    // If inspection failed, mark asset as out of service
    if (result === 'failed') {
      const { error: assetError } = await supabase
        .from('assets')
        .update({ 
          status: 'out_of_service',
          updated_at: new Date().toISOString()
        })
        .eq('id', asset_id)
        .eq('organization_id', userData.organization_id);

      if (assetError) {
        console.error('VGP Inspections POST: Asset status update error', assetError);
        // Don't fail entire request if asset update fails
      } else {
        console.log('VGP Inspections POST: Asset marked out_of_service', asset_id);
      }
    }

    return NextResponse.json(
      {
        success: true,
        inspection,
        message: 'Inspection enregistrée avec succès'
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('VGP Inspections POST: Unexpected error', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/vgp/inspections/[id]
 * Update an existing inspection (not yet implemented)
 */
export async function PATCH() {
  return NextResponse.json(
    { error: 'PATCH not implemented yet' },
    { status: 501 }
  );
}

/**
 * DELETE /api/vgp/inspections/[id]
 * Delete an inspection (not yet implemented)
 */
export async function DELETE() {
  return NextResponse.json(
    { error: 'DELETE not implemented yet' },
    { status: 501 }
  );
}