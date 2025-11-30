// app/api/settings/organization/route.ts
// API endpoints for organization profile settings
// Handles: GET, PATCH operations

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/settings/organization
// Fetch current organization settings
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Fetch organization settings
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select(
        `
        id,
        name,
        slug,
        logo_url,
        website,
        phone,
        address,
        city,
        postal_code,
        country,
        timezone,
        currency,
        industry_sector,
        company_size,
        created_at,
        updated_at
      `
      )
      .eq('id', userData.organization_id)
      .single();

    if (orgError) {
      console.error('Error fetching organization:', orgError);
      return NextResponse.json(
        { error: 'Failed to fetch organization settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ organization }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in GET /api/settings/organization:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/settings/organization
// Update organization profile settings
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization and role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Check if user has permission to update settings
    if (!['owner', 'admin'].includes(userData.role)) {
      return NextResponse.json(
        { error: 'Permission denied. Only owners and admins can update settings.' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Validate and sanitize input
    const allowedFields = [
      'name',
      'logo_url',
      'website',
      'phone',
      'address',
      'city',
      'postal_code',
      'country',
      'timezone',
      'currency',
      'industry_sector',
      'company_size',
    ];

    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    // Ensure at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString();

    // Update organization
    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', userData.organization_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating organization:', updateError);
      return NextResponse.json(
        { error: 'Failed to update organization settings' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Organization settings updated successfully',
        organization: updatedOrg,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in PATCH /api/settings/organization:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}