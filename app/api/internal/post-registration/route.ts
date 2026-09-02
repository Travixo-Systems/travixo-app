// app/api/internal/post-registration/route.ts
// Called from the confirm page after org creation.
// Seeds demo data (Workstream B) and sends welcome email (Workstream C).

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { seedDemoData } from '@/lib/seed/demo-data';
import { sendWelcomeEmail } from '@/lib/email/send-welcome-email';
import { sendDemoShowcaseAlert } from '@/lib/email/email-service';

/**
 * Service-role client, used ONLY for the one-shot email claims below.
 *
 * The session client cannot be used for them. Claiming is an UPDATE on
 * organizations, and the RLS policy on that table does not grant a member the
 * right to write these columns -- the update would silently affect zero rows,
 * which this code reads as "already sent" and would suppress every email.
 */
function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Take exclusive ownership of a one-shot email for an organization.
 *
 * The condition lives INSIDE the UPDATE rather than in a preceding SELECT. A
 * read-then-write pair is the exact shape of the bug being fixed here: two
 * concurrent callers both read false, both consider themselves first, and both
 * send. With the condition in the statement, Postgres row-locks for its
 * duration and exactly one caller sees a returned row.
 *
 * Returns true only for the caller that won the claim. A database error returns
 * false -- declining to send is the safe direction, since the alternative is
 * mailing someone twice.
 */
async function claimOneShotEmail(
  orgId: string,
  column: 'welcome_email_sent' | 'demo_alert_sent'
): Promise<boolean> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from('organizations')
    .update({ [column]: true })
    .eq('id', orgId)
    .eq(column, false)
    .select('id');

  if (error) {
    console.error(`[POST-REGISTRATION] Claim failed for ${column}:`, error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/**
 * The seeded specimen shown in the showcase email.
 *
 * Mirrors the Toyota that lib/seed/demo-data.ts creates ten days overdue. Kept
 * as a literal rather than read back from the database: the email is a worked
 * example, so it must render identically even if the seed partly failed, and a
 * query here would add a failure mode to a path that is already best-effort.
 */
const DEMO_SPECIMEN = {
  assetName: 'Chariot elevateur Toyota 8FD25',
  serialNumber: 'CHA-2021-0103',
  daysOverdue: 10,
  actionRequired:
    "Planifier la VGP aupres d'un organisme agree et enregistrer le rapport dans TraviXO.",
};

/**
 * Claim and send the demo showcase alert, at most once per organization.
 *
 * The claim is a conditional UPDATE rather than a read followed by a write.
 * Two callers racing on the same org both see demo_alert_sent = false if they
 * read first, and both send; with the condition inside the UPDATE, Postgres
 * row-locks for the statement and exactly one caller gets a row back.
 *
 * Returns whether this call actually delivered an email.
 */
async function sendDemoShowcaseAlertOnce(
  orgId: string,
  orgName: string,
  recipientEmail: string
): Promise<boolean> {
  // Another caller already claimed it, or this org was backfilled as sent.
  if (!(await claimOneShotEmail(orgId, 'demo_alert_sent'))) return false;

  const result = await sendDemoShowcaseAlert({
    organizationName: orgName,
    recipientEmail,
    specimen: DEMO_SPECIMEN,
  });

  if (!result.success) {
    // The claim is intentionally NOT released. Releasing it would reopen the
    // duplicate-send race this guard exists to close, and a missed sample email
    // is a far smaller problem than a second one arriving days later, which
    // reads as a genuine compliance alert.
    console.error('[POST-REGISTRATION] Showcase send failed:', result.error);
  }

  return result.success;
}

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

    // 3. Seed demo data (idempotent, checks flag internally)
    let seedResult = { success: true, assetsCreated: 0, schedulesCreated: 0 };
    if (!alreadySeeded) {
      seedResult = await seedDemoData(orgId);
    }

    // 4. Send the welcome email, at most once per organization.
    //
    // This call used to be unconditional -- outside the demo_data_seeded guard
    // above -- so every request that reached this route sent another welcome
    // email with its 21KB xlsx attachment. Two callers raced for a single
    // signup, and a failed seed left the dashboard caller re-sending forever.
    //
    // The claim is taken BEFORE the send. A send that then fails is not
    // retried: a duplicate welcome is worse than a missing one, and the failure
    // is logged for follow-up.
    let welcomeSent = false;
    if (await claimOneShotEmail(orgId, 'welcome_email_sent')) {
      const emailResult = await sendWelcomeEmail({
        email: user.email!,
        fullName,
        companyName: orgName,
      });
      welcomeSent = emailResult.success;

      if (!emailResult.success) {
        console.error('[POST-REGISTRATION] Welcome email failed:', emailResult.error);
      }
    }

    // 5. Send the one-time demo showcase alert.
    //
    // The cron no longer emails demo assets, so the seeded overdue Toyota no
    // longer demonstrates the alert format on its own. This puts that
    // demonstration back as a single deliberate send.
    //
    // Gated on the seed having succeeded. The email describes a specific piece
    // of demo equipment and links into the app expecting it to be there; if the
    // seed failed there is nothing to show, and the claim would be burned on an
    // email that describes equipment the account does not have.
    const demoDataPresent = alreadySeeded || seedResult.success;
    const showcaseSent = demoDataPresent
      ? await sendDemoShowcaseAlertOnce(orgId, orgName, user.email!)
      : false;

    return NextResponse.json({
      success: true,
      seed: {
        assetsCreated: seedResult.assetsCreated,
        schedulesCreated: seedResult.schedulesCreated,
      },
      email: {
        sent: welcomeSent,
      },
      showcase: {
        sent: showcaseSent,
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
