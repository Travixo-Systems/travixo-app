// ============================================================================
// FILE: app/api/audits/route.ts
// PURPOSE: Audits CRUD API - GET, POST, PATCH, DELETE
// COPY TO: your-project/app/api/audits/route.ts
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/server/require-feature';

// ============================================================================
// GET /api/audits - List all audits for the organization
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Feature gate: require digital_audits (also handles auth + org lookup)
    const { denied, organizationId } = await requireFeature(supabase, 'digital_audits');
    if (denied) return denied;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let query = supabase
      .from('audits')
      .select(`
        *,
        users:created_by (
          full_name,
          email
        )
      `, { count: 'exact' })
      .eq('organization_id', organizationId!)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply status filter if provided
    if (status && ['planned', 'in_progress', 'completed'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data: audits, error: auditsError, count } = await query;

    if (auditsError) {
      console.error('Error fetching audits:', auditsError);
      return NextResponse.json(
        { error: 'Failed to fetch audits' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      audits: audits || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Audits GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/audits - Create a new audit
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Feature gate: require digital_audits (also handles auth + org lookup)
    const { denied, organizationId } = await requireFeature(supabase, 'digital_audits');
    if (denied) return denied;

    // Need user info for created_by and role check
    const { data: { user } } = await supabase.auth.getUser();
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user!.id)
      .single();

    // Check permissions (owner, admin, or member can create audits)
    if (!['owner', 'admin', 'member'].includes(userData?.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, scheduled_date, scope, location, category_id } = body;

    // Validate required fields
    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Audit name is required' },
        { status: 400 }
      );
    }

    // Get assets based on scope
    let assetsQuery = supabase
      .from('assets')
      .select('id')
      .eq('organization_id', organizationId!);

    if (scope === 'location' && location) {
      assetsQuery = assetsQuery.eq('current_location', location);
    } else if (scope === 'category' && category_id) {
      assetsQuery = assetsQuery.eq('category_id', category_id);
    }

    const { data: assets, error: assetsError } = await assetsQuery;

    if (assetsError) {
      console.error('Error fetching assets:', assetsError);
      return NextResponse.json(
        { error: 'Failed to fetch assets' },
        { status: 500 }
      );
    }

    const assetIds = (assets || []).map(a => a.id);

    // Create the audit
    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .insert({
        organization_id: organizationId!,
        name: name.trim(),
        status: 'planned',
        scheduled_date: scheduled_date || null,
        total_assets: assetIds.length,
        verified_assets: 0,
        missing_assets: 0,
        created_by: user.id,
      })
      .select()
      .single();

    if (auditError) {
      console.error('Error creating audit:', auditError);
      return NextResponse.json(
        { error: 'Failed to create audit' },
        { status: 500 }
      );
    }

    // Create audit items for each asset
    if (assetIds.length > 0) {
      const auditItems = assetIds.map(assetId => ({
        audit_id: audit.id,
        asset_id: assetId,
        status: 'pending',
      }));

      const { error: itemsError } = await supabase
        .from('audit_items')
        .insert(auditItems);

      if (itemsError) {
        console.error('Error creating audit items:', itemsError);
        // Don't fail the request, just log the error
      }
    }

    return NextResponse.json({ audit }, { status: 201 });
  } catch (error) {
    console.error('Audits POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/audits - Update an audit (by ID in body)
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Feature gate: require digital_audits (also handles auth + org lookup)
    const { denied, organizationId } = await requireFeature(supabase, 'digital_audits');
    if (denied) return denied;

    // Parse request body
    const body = await request.json();
    const { id, status, started_at, completed_at, verified_assets, missing_assets } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Audit ID is required' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    
    if (status) {
      if (!['planned', 'in_progress', 'completed'].includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status value' },
          { status: 400 }
        );
      }
      updateData.status = status;
      
      // Auto-set timestamps based on status
      if (status === 'in_progress' && !started_at) {
        updateData.started_at = new Date().toISOString();
      }
      if (status === 'completed' && !completed_at) {
        updateData.completed_at = new Date().toISOString();
      }
    }

    if (started_at !== undefined) updateData.started_at = started_at;
    if (completed_at !== undefined) updateData.completed_at = completed_at;
    if (verified_assets !== undefined) updateData.verified_assets = verified_assets;
    if (missing_assets !== undefined) updateData.missing_assets = missing_assets;

    // Update the audit
    const { data: audit, error: updateError } = await supabase
      .from('audits')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', organizationId!)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating audit:', updateError);
      return NextResponse.json(
        { error: 'Failed to update audit' },
        { status: 500 }
      );
    }

    if (!audit) {
      return NextResponse.json(
        { error: 'Audit not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ audit });
  } catch (error) {
    console.error('Audits PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/audits - Delete an audit
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Feature gate: require digital_audits (also handles auth + org lookup)
    const { denied, organizationId } = await requireFeature(supabase, 'digital_audits');
    if (denied) return denied;

    // Need user role for permission check
    const { data: { user } } = await supabase.auth.getUser();
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user!.id)
      .single();

    // Only owner and admin can delete audits
    if (!['owner', 'admin'].includes(userData?.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get audit ID from query params
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Audit ID is required' },
        { status: 400 }
      );
    }

    // Delete audit items first (cascade would handle this, but being explicit)
    await supabase
      .from('audit_items')
      .delete()
      .eq('audit_id', id);

    // Delete the audit
    const { error: deleteError } = await supabase
      .from('audits')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId!);

    if (deleteError) {
      console.error('Error deleting audit:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete audit' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Audits DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}