// app/api/internal/post-registration/route.ts
// Called from the confirm page after org creation.
// Seeds demo data (Workstream B) and sends welcome email (Workstream C).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { seedDemoData } from '@/lib/seed/demo-data';
import { sendWelcomeEmail } from '@/lib/email/send-welcome-email';

export async function POST() {
  try {
    const supabase = await createClient();

    // 1. Verify authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user profile and org
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id, full_name, organizations(name, demo_data_seeded)')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const orgData = profile as unknown as {
      organization_id: string;
      full_name: string;
      organizations: { name: string; demo_data_seeded: boolean } | null;
    };

    const orgId = orgData.organization_id;
    const orgName = orgData.organizations?.name || 'Your Organization';
    const fullName = orgData.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    const alreadySeeded = orgData.organizations?.demo_data_seeded || false;

    // 3. Seed demo data (idempotent — checks flag internally)
    let seedResult = { success: true, assetsCreated: 0, schedulesCreated: 0 };
    if (!alreadySeeded) {
      seedResult = await seedDemoData(orgId);
    }

    // 4. Send welcome email (fire-and-forget — don't block confirmation)
    const emailResult = await sendWelcomeEmail({
      email: user.email!,
      fullName,
      companyName: orgName,
    });

    return NextResponse.json({
      success: true,
      seed: {
        assetsCreated: seedResult.assetsCreated,
        schedulesCreated: seedResult.schedulesCreated,
      },
      email: {
        sent: emailResult.success,
      },
    });
  } catch (error: any) {
    console.error('[POST-REGISTRATION] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error', detail: error.message },
      { status: 500 }
    );
  }
}
