// app/api/vgp/inspections/route.ts
// VGP Inspection Recording API - Handles inspection CRUD operations
// Supports UploadThing certificate uploads via certificate_url field

import { createServerClient } from '@supabase/ssr';
import { RESOLVED_SLOT_HEADER, cookieOptionsForSlot } from '@/lib/supabase/account-slot';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { requireFeature, requireVGPWriteAccess } from '@/lib/server/require-feature';
import { requireWriteAccess } from '@/lib/server/require-write-access';
import { resolveIdentity } from '@/lib/server/request-identity';
import * as Sentry from '@sentry/node';

/**
 * Create authenticated Supabase client for server-side operations
 */
async function createClient() {
  const cookieStore = await cookies();
  // Per-tab account slot, resolved by proxy.ts. Absent -> slot 0.
  const slotRaw = (await headers()).get(RESOLVED_SLOT_HEADER);
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Must match every other Supabase client; see lib/supabase/cookie-name.ts
      cookieOptions: cookieOptionsForSlot(slotRaw),
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
    const supabase = await createClient();

    // Feature gate: require vgp_compliance (also handles auth + org lookup)
    const { denied, organizationId } = await requireFeature(supabase, 'vgp_compliance');
    if (denied) return denied;

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
      .eq('organization_id', organizationId!)
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
    const supabase = await createClient();

    // Refuse mutations once the pilot has expired. The whole app becomes
    // read-only at day 30 - see lib/billing/access-model.ts.
    const writeGate = await requireWriteAccess(supabase);
    if (writeGate.denied) return writeGate.denied;

    // Feature gate: require VGP write access (blocks expired pilots)
    const { denied, organizationId } = await requireVGPWriteAccess(supabase);
    if (denied) return denied;

    // Need user.id for performed_by. Both gates above already resolved the
    // caller, so this reads the request-scoped memo rather than making a third
    // round trip to GoTrue for an identity we have twice over.
    const identity = await resolveIdentity(supabase);
    if (!identity.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = { id: identity.userId };

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
      verification_type,
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

    // Certificate is mandatory for DREETS compliance
    if (!certificate_url) {
      return NextResponse.json(
        { error: 'Le rapport de vérification est obligatoire pour la conformité DREETS' },
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

    // ONE call, ONE transaction.
    //
    // This replaced three sequential writes -- the inspection, the schedule
    // advance, and out_of_service on a failed result -- where the last two
    // logged their errors and carried on. The dangerous combination was the
    // first succeeding and the third failing: a FAILED inspection on record
    // while the machine still read available, so checkout would let it out to
    // a customer while the inspector believed the system had acted.
    //
    // record_inspection() does all three or none. See
    // supabase/migrations/20260903100000_record_inspection_rpc.sql.
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'record_inspection',
      {
        p_asset_id: asset_id,
        p_inspection_date: inspection_date,
        p_inspector_name: inspector_name,
        p_result: result,
        p_certificate_url: certificate_url,
        p_schedule_id: schedule_id || null,
        p_inspector_company: inspector_company || null,
        p_certification_number: certification_number || null,
        p_findings: findings || null,
        p_verification_type: verification_type || 'PERIODIQUE',
        p_interval_months: Number(interval_months) || 12,
        p_certificate_file_name: certificate_file_name || null,
      }
    );

    if (rpcError) {
      // Nothing was written: the function is one transaction, so a failure
      // here means the inspection does NOT exist. Say so plainly rather than
      // returning a 500 the inspector cannot act on.
      console.error('VGP Inspections POST: record_inspection failed', rpcError);
      Sentry.captureException(rpcError, {
        tags: { area: 'vgp_inspections', step: 'record_inspection' },
        extra: { asset_id, schedule_id, result },
      });
      return NextResponse.json(
        { error: mapInspectionError(rpcError.message) },
        { status: inspectionErrorStatus(rpcError.message) }
      );
    }

    const inspection = (rpcResult as any)?.inspection;
    console.log('VGP Inspections POST: recorded', inspection?.id,
      'asset_blocked=' + ((rpcResult as any)?.asset_blocked === true));

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
 * Turn a record_inspection() error into something the inspector can act on.
 *
 * The RPC raises these with distinct codes precisely so the UI can say what
 * went wrong. A generic 500 tells the person standing next to the machine
 * nothing, and the whole point of the atomic version is that a failure means
 * the inspection was NOT saved. They need to know that, because otherwise they
 * will assume it was and walk away.
 */
function mapInspectionError(message: string): string {
  if (message.includes('certificate_required')) {
    return 'Le rapport de verification est obligatoire pour la conformite DREETS.'
  }
  if (message.includes('asset_not_found')) {
    return 'Cet equipement est introuvable dans votre organisation.'
  }
  if (message.includes('schedule_not_found')) {
    return 'L\'echeancier VGP est introuvable dans votre organisation.'
  }
  if (message.includes('invalid_result')) {
    return 'Resultat invalide. Utilisez conforme, conditionnel ou non conforme.'
  }
  if (message.includes('no_organization')) {
    return 'Aucune organisation associee a votre compte.'
  }
  // Anything else is genuinely unexpected. Still lead with the fact that
  // changes what they do next: it was not saved.
  return 'L\'inspection n\'a pas ete enregistree. Reessayez ou contactez le support.'
}

function inspectionErrorStatus(message: string): number {
  if (message.includes('no_organization')) return 403
  if (message.includes('asset_not_found') || message.includes('schedule_not_found')) return 404
  if (message.includes('certificate_required') || message.includes('invalid_result')) return 400
  return 500
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