// app/api/settings/notifications/route.ts
// API endpoints for notification preferences management
// Handles: GET, PATCH operations for email alerts, VGP timing, digest settings

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface NotificationPreferences {
  email_enabled: boolean;
  vgp_alerts: {
    enabled: boolean;
    timing: number[]; // Days before due date: [30, 15, 7, 1]
    recipients: string[]; // ['owner', 'admin', 'all']
  };
  digest_mode: 'immediate' | 'daily' | 'weekly' | 'never';
  asset_alerts: boolean;
  audit_alerts: boolean;
}

// Validate notification preferences structure
function validatePreferences(prefs: any): { valid: boolean; error?: string } {
  if (typeof prefs !== 'object' || prefs === null) {
    return { valid: false, error: 'Preferences must be an object' };
  }

  if (typeof prefs.email_enabled !== 'boolean') {
    return { valid: false, error: 'email_enabled must be a boolean' };
  }

  if (!prefs.vgp_alerts || typeof prefs.vgp_alerts !== 'object') {
    return { valid: false, error: 'vgp_alerts must be an object' };
  }

  if (typeof prefs.vgp_alerts.enabled !== 'boolean') {
    return { valid: false, error: 'vgp_alerts.enabled must be a boolean' };
  }

  if (!Array.isArray(prefs.vgp_alerts.timing)) {
    return { valid: false, error: 'vgp_alerts.timing must be an array' };
  }

  // Validate timing values are positive numbers
  for (const day of prefs.vgp_alerts.timing) {
    if (typeof day !== 'number' || day < 1 || day > 365) {
      return {
        valid: false,
        error: 'vgp_alerts.timing must contain numbers between 1 and 365',
      };
    }
  }

  if (!Array.isArray(prefs.vgp_alerts.recipients)) {
    return { valid: false, error: 'vgp_alerts.recipients must be an array' };
  }

  const validRecipients = ['owner', 'admin', 'all'];
  for (const recipient of prefs.vgp_alerts.recipients) {
    if (!validRecipients.includes(recipient)) {
      return {
        valid: false,
        error: `Invalid recipient: ${recipient}. Must be one of: ${validRecipients.join(', ')}`,
      };
    }
  }

  const validDigestModes = ['immediate', 'daily', 'weekly', 'never'];
  if (!validDigestModes.includes(prefs.digest_mode)) {
    return {
      valid: false,
      error: `Invalid digest_mode: ${prefs.digest_mode}. Must be one of: ${validDigestModes.join(', ')}`,
    };
  }

  if (typeof prefs.asset_alerts !== 'boolean') {
    return { valid: false, error: 'asset_alerts must be a boolean' };
  }

  if (typeof prefs.audit_alerts !== 'boolean') {
    return { valid: false, error: 'audit_alerts must be a boolean' };
  }

  return { valid: true };
}

// GET /api/settings/notifications
// Fetch current notification preferences
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

    // Fetch notification preferences
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, notification_preferences')
      .eq('id', userData.organization_id)
      .single();

    if (orgError) {
      console.error('Error fetching notification preferences:', orgError);
      return NextResponse.json(
        { error: 'Failed to fetch notification preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        preferences: organization.notification_preferences as NotificationPreferences,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in GET /api/settings/notifications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/settings/notifications
// Update notification preferences
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

    // Check if user has permission to update notifications
    if (!['owner', 'admin'].includes(userData.role)) {
      return NextResponse.json(
        {
          error:
            'Permission denied. Only owners and admins can update notification preferences.',
        },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { preferences } = body;

    if (!preferences) {
      return NextResponse.json(
        { error: 'Missing preferences in request body' },
        { status: 400 }
      );
    }

    // Validate preferences structure
    const validation = validatePreferences(preferences);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Update notification preferences
    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update({
        notification_preferences: preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userData.organization_id)
      .select('id, name, notification_preferences')
      .single();

    if (updateError) {
      console.error('Error updating notification preferences:', updateError);
      return NextResponse.json(
        { error: 'Failed to update notification preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Notification preferences updated successfully',
        preferences: updatedOrg.notification_preferences as NotificationPreferences,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in PATCH /api/settings/notifications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/settings/notifications/reset
// Reset notification preferences to defaults
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

    // Reset to default preferences
    const defaultPreferences: NotificationPreferences = {
      email_enabled: true,
      vgp_alerts: {
        enabled: true,
        timing: [30, 15, 7, 1],
        recipients: ['owner'],
      },
      digest_mode: 'daily',
      asset_alerts: true,
      audit_alerts: true,
    };

    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update({
        notification_preferences: defaultPreferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userData.organization_id)
      .select('id, name, notification_preferences')
      .single();

    if (updateError) {
      console.error('Error resetting notification preferences:', updateError);
      return NextResponse.json(
        { error: 'Failed to reset notification preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Notification preferences reset to default',
        preferences: updatedOrg.notification_preferences as NotificationPreferences,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/settings/notifications/reset:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}