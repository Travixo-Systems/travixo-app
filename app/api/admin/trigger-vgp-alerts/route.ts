// =============================================================================
// Manual VGP Alert Trigger - Admin Testing Endpoint
// POST /api/admin/trigger-vgp-alerts
//
// Protected: PLATFORM ADMINS ONLY (public.platform_admins membership).
//
// This runs the real VGP alert cron and SENDS REAL EMAIL to customer
// recipients. It is not a read-only diagnostic.
//
// It previously gated on the caller's TENANT role (users.role in
// ('admin','owner')). That is a different privilege model: under B1 a platform
// admin is a platform_admins row whose users.role is an ordinary 'member' with
// a NULL organization_id. So the old check simultaneously
//   - admitted every tenant owner/admin of every organization, and
//   - excluded the actual platform admins.
// See lib/auth/requireSuperAdminApi.ts for the model.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdminApi } from '@/lib/auth/requireSuperAdminApi';
import { runVGPAlertsCron } from '@/app/api/cron/vgp-alerts/route';

const LOG_PREFIX = '[VGP-MANUAL-TRIGGER]';

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} Manual trigger called`);

  // Platform-admin gate. Returns a 401/403 response rather than redirecting:
  // a redirect is unreadable to a POST caller. Fails closed on RPC error.
  const supabase = await createClient();
  const gate = await requireSuperAdminApi(supabase);

  if (gate.denied) {
    console.log(
      `${LOG_PREFIX} Denied: ${gate.email ?? 'unauthenticated'} is not a platform admin`
    );
    return gate.denied;
  }

  console.log(
    `${LOG_PREFIX} Authorized: ${gate.email} (platform admin) triggered manual alert run`
  );

  // Run the cron logic.
  try {
    const result = await runVGPAlertsCron();

    console.log(
      `${LOG_PREFIX} Manual trigger complete: ${result.emails_sent} emails sent, ${result.errors.length} errors`
    );

    return NextResponse.json({
      ...result,
      triggered_by: gate.email,
      triggered_at: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`${LOG_PREFIX} Unhandled error: ${msg}`);

    return NextResponse.json(
      {
        success: false,
        error: msg,
        triggered_by: gate.email,
        triggered_at: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
