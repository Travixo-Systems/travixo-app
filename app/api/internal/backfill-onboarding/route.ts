// app/api/internal/backfill-onboarding/route.ts
// One-time admin endpoint: seeds demo data + sends welcome email
// for existing orgs that were created before the onboarding system.
//
// Usage (after running the SQL migration):
//   curl -X POST https://app.travixosystems.com/api/internal/backfill-onboarding \
//        -H "Authorization: Bearer <BACKFILL_SECRET>"
//
// Remove this route after the backfill is complete.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { seedDemoData } from '@/lib/seed/demo-data';
import { sendWelcomeEmail } from '@/lib/email/send-welcome-email';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BACKFILL_SECRET = process.env.BACKFILL_SECRET || '';

export async function POST(request: NextRequest) {
  // Guard: require a shared secret so this can't be called by anyone
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!BACKFILL_SECRET || token !== BACKFILL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Find all orgs that haven't been seeded yet
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('demo_data_seeded', false);

  if (orgsError) {
    return NextResponse.json({ error: orgsError.message }, { status: 500 });
  }

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ message: 'No orgs to backfill', results: [] });
  }

  const results = [];

  for (const org of orgs) {
    // 1. Seed demo data
    const seedResult = await seedDemoData(org.id);

    // 2. Find the owner to send the welcome email
    const { data: owner } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('organization_id', org.id)
      .eq('role', 'owner')
      .single();

    let emailResult = { success: false, error: 'No owner found' };

    if (owner?.email) {
      emailResult = await sendWelcomeEmail({
        email: owner.email,
        fullName: owner.full_name || owner.email.split('@')[0],
        companyName: org.name || 'Your Organization',
      });
    }

    results.push({
      orgId: org.id,
      orgName: org.name,
      seed: { success: seedResult.success, assets: seedResult.assetsCreated },
      email: { success: emailResult.success },
    });

    console.log(
      `[BACKFILL] Org ${org.name} (${org.id}): seed=${seedResult.success}, email=${emailResult.success}`
    );
  }

  return NextResponse.json({
    message: `Backfilled ${results.length} organization(s)`,
    results,
  });
}
