// =============================================================================
// Manual VGP Alert Trigger - Admin Testing Endpoint
// POST /api/admin/trigger-vgp-alerts
//
// Protected: Only users with role 'admin' or 'owner' can trigger
// Returns: JSON summary of what was (or would be) sent
//
// CORRECTED: Uses existing @/lib/supabase/server createClient
//            instead of creating an inline client
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runVGPAlertsCron } from '@/app/api/cron/vgp-alerts/route';

const LOG_PREFIX = '[VGP-MANUAL-TRIGGER]';

// ---------------------------------------------------------------------------
// Auth helper: Get current user via existing server client
// ---------------------------------------------------------------------------

async function getAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Fetch user role from users table
  const { data: userData } = await supabase
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();

  if (!userData) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: userData.role,
    organization_id: userData.organization_id,
  };
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} Manual trigger called`);

  // 1. Authenticate user
  const user = await getAuthenticatedUser();

  if (!user) {
    console.log(`${LOG_PREFIX} Unauthorized: no authenticated user`);
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  // 2. Check admin/owner role
  if (!['admin', 'owner'].includes(user.role)) {
    console.log(
      `${LOG_PREFIX} Forbidden: user ${user.email} has role ${user.role}`
    );
    return NextResponse.json(
      { error: 'Only admin or owner users can trigger VGP alerts' },
      { status: 403 }
    );
  }

  console.log(
    `${LOG_PREFIX} Authorized: ${user.email} (${user.role}) triggered manual alert run`
  );

  // 3. Run the cron logic
  try {
    const result = await runVGPAlertsCron();

    console.log(
      `${LOG_PREFIX} Manual trigger complete: ${result.emails_sent} emails sent, ${result.errors.length} errors`
    );

    return NextResponse.json({
      ...result,
      triggered_by: user.email,
      triggered_at: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`${LOG_PREFIX} Unhandled error: ${msg}`);

    return NextResponse.json(
      {
        success: false,
        error: msg,
        triggered_by: user.email,
        triggered_at: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}