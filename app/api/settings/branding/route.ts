// app/api/settings/branding/route.ts
// API endpoints for organization branding customization
// Handles: GET, PATCH operations for color schemes and logos

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface BrandingColors {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
}

// Validate hex color format
function isValidHexColor(color: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(color);
}

// GET /api/settings/branding
// Fetch current branding settings
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

    // Fetch branding settings
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, logo_url, branding_colors')
      .eq('id', userData.organization_id)
      .single();

    if (orgError) {
      console.error('Error fetching branding settings:', orgError);
      return NextResponse.json(
        { error: 'Failed to fetch branding settings' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        branding: {
          logo_url: organization.logo_url,
          colors: organization.branding_colors as BrandingColors,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in GET /api/settings/branding:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/settings/branding
// Update branding settings (colors and/or logo)
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

    // Check if user has permission to update branding
    if (!['owner', 'admin'].includes(userData.role)) {
      return NextResponse.json(
        { error: 'Permission denied. Only owners and admins can update branding.' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { colors, logo_url } = body;

    const updateData: Record<string, any> = {};

    // Validate and update colors if provided
    if (colors) {
      const requiredColorKeys = [
        'primary',
        'secondary',
        'accent',
        'success',
        'warning',
        'danger',
      ];

      // Validate all required color keys are present
      for (const key of requiredColorKeys) {
        if (!(key in colors)) {
          return NextResponse.json(
            { error: `Missing required color: ${key}` },
            { status: 400 }
          );
        }

        // Validate hex color format
        if (!isValidHexColor(colors[key])) {
          return NextResponse.json(
            { error: `Invalid hex color format for ${key}: ${colors[key]}` },
            { status: 400 }
          );
        }
      }

      updateData.branding_colors = colors;
    }

    // Update logo URL if provided
    if (logo_url !== undefined) {
      // Allow null to remove logo
      if (logo_url !== null && typeof logo_url !== 'string') {
        return NextResponse.json(
          { error: 'Invalid logo_url format' },
          { status: 400 }
        );
      }
      updateData.logo_url = logo_url;
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

    // Update organization branding
    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', userData.organization_id)
      .select('id, name, logo_url, branding_colors')
      .single();

    if (updateError) {
      console.error('Error updating branding:', updateError);
      return NextResponse.json(
        { error: 'Failed to update branding settings' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Branding updated successfully',
        branding: {
          logo_url: updatedOrg.logo_url,
          colors: updatedOrg.branding_colors as BrandingColors,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in PATCH /api/settings/branding:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/settings/branding/reset
// Reset branding to default industrial colors
export async function POST(request: NextRequest) {
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

    // Check if user has permission
    if (!['owner', 'admin'].includes(userData.role)) {
      return NextResponse.json(
        { error: 'Permission denied' },
        { status: 403 }
      );
    }

    // Reset to default industrial colors
    const defaultColors: BrandingColors = {
      primary: '#1e3a5f',
      secondary: '#2d5a7b',
      accent: '#d97706',
      success: '#047857',
      warning: '#eab308',
      danger: '#b91c1c',
    };

    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update({
        branding_colors: defaultColors,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userData.organization_id)
      .select('id, name, logo_url, branding_colors')
      .single();

    if (updateError) {
      console.error('Error resetting branding:', updateError);
      return NextResponse.json(
        { error: 'Failed to reset branding' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Branding reset to default',
        branding: {
          logo_url: updatedOrg.logo_url,
          colors: updatedOrg.branding_colors as BrandingColors,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/settings/branding/reset:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}