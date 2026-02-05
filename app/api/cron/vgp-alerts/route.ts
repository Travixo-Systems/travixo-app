// =============================================================================
// VGP Alerts Cron Job
// Schedule: Daily at 7:00 UTC (8:00 AM Paris time CET)
// Checks all active VGP schedules, groups by org, sends appropriate alerts
//
// Security: Protected by CRON_SECRET header (Vercel sends this automatically)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import {
  sendVGPAlert,
  logEmailAlerts,
  filterAlreadySentAlerts,
  getAlertRecipients,
  getOrgNotificationPrefs,
  getDailyEmailCount,
} from '@/lib/email/email-service';

import type {
  VGPAlertType,
  VGPScheduleWithAsset,
  ScheduleTableRow,
  CronJobResult,
  CronOrgDetail,
} from '@/types/vgp-alerts';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;
const LOG_PREFIX = '[VGP-CRON]';

// Max emails per cron run (rate limit safety)
const MAX_EMAILS_PER_RUN = 80;

// ---------------------------------------------------------------------------
// Helper: Create admin Supabase client (bypasses RLS)
// ---------------------------------------------------------------------------

function getAdminSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Helper: Calculate days between today and a date
// ---------------------------------------------------------------------------

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Helper: Map a schedule+asset row into a ScheduleTableRow
// ---------------------------------------------------------------------------

function toTableRow(schedule: VGPScheduleWithAsset): ScheduleTableRow {
  const days = daysUntil(schedule.next_due_date);
  const dueDate = new Date(schedule.next_due_date);

  return {
    assetName: schedule.assets?.name || 'Equipement inconnu',
    serialNumber: schedule.assets?.serial_number || '-',
    category: schedule.assets?.asset_categories?.name || '-',
    location: schedule.assets?.location || '-',
    dueDate: dueDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    daysRemaining: days,
  };
}

// ---------------------------------------------------------------------------
// Helper: Classify a schedule into the correct alert bucket
// ---------------------------------------------------------------------------

function classifySchedule(
  schedule: VGPScheduleWithAsset
): VGPAlertType | null {
  const days = daysUntil(schedule.next_due_date);

  if (days < 0) return 'overdue';
  if (days <= 1) return 'reminder_1day';
  if (days <= 7) return 'reminder_7day';
  if (days <= 30) return 'reminder_30day';

  return null; // Not due within 30 days
}

// ---------------------------------------------------------------------------
// Helper: Map alert type to the "day number" for preference checking
// ---------------------------------------------------------------------------

function alertTypeToDayNumber(alertType: VGPAlertType): number {
  switch (alertType) {
    case 'reminder_30day': return 30;
    case 'reminder_7day': return 7;
    case 'reminder_1day': return 1;
    case 'overdue': return 0;
  }
}

// ---------------------------------------------------------------------------
// Main cron logic
// ---------------------------------------------------------------------------

async function runVGPAlertsCron(): Promise<CronJobResult> {
  const startTime = Date.now();
  const result: CronJobResult = {
    success: true,
    timestamp: new Date().toISOString(),
    organizations_processed: 0,
    emails_sent: 0,
    errors: [],
    details: [],
  };

  console.log(`${LOG_PREFIX} === VGP Alert Cron Job Started ===`);

  // Check daily email limit
  const dailyCount = await getDailyEmailCount();
  console.log(`${LOG_PREFIX} Daily email count so far: ${dailyCount}`);

  if (dailyCount >= MAX_EMAILS_PER_RUN) {
    console.log(`${LOG_PREFIX} Daily email limit reached (${dailyCount}), aborting`);
    result.errors.push(`Daily email limit reached: ${dailyCount}`);
    return result;
  }

  const supabase = getAdminSupabase();

  // -------------------------------------------------------------------------
  // 1. Query all active schedules with asset details, due within 30 days or overdue
  // -------------------------------------------------------------------------

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const cutoffDate = thirtyDaysFromNow.toISOString().split('T')[0];

  console.log(`${LOG_PREFIX} Querying active schedules with next_due_date <= ${cutoffDate}`);

  const { data: schedules, error: schedulesError } = await supabase
    .from('vgp_schedules')
    .select(`
      id,
      asset_id,
      organization_id,
      interval_months,
      last_inspection_date,
      next_due_date,
      inspector_name,
      inspector_company,
      status,
      assets (
        id,
        name,
        serial_number,
        location,
        status,
        category_id,
        asset_categories (
          name
        )
      )
    `)
    .is('archived_at', null)
    .eq('status', 'active')
    .lte('next_due_date', cutoffDate)
    .order('next_due_date', { ascending: true });

  if (schedulesError) {
    console.log(`${LOG_PREFIX} Error querying schedules: ${schedulesError.message}`);
    result.success = false;
    result.errors.push(`Database query error: ${schedulesError.message}`);
    return result;
  }

  if (!schedules || schedules.length === 0) {
    console.log(`${LOG_PREFIX} No active schedules due within 30 days. Done.`);
    return result;
  }

  console.log(`${LOG_PREFIX} Found ${schedules.length} schedules to evaluate`);

  // -------------------------------------------------------------------------
  // 2. Filter out schedules with no linked asset (orphaned)
  // -------------------------------------------------------------------------

  const validSchedules = (schedules as unknown as VGPScheduleWithAsset[]).filter(
    (s) => s.assets && s.assets.id
  );

  const orphanedCount = schedules.length - validSchedules.length;
  if (orphanedCount > 0) {
    console.log(`${LOG_PREFIX} Skipping ${orphanedCount} orphaned schedules (no linked asset)`);
  }

  // -------------------------------------------------------------------------
  // 3. Group by organization and classify into alert buckets
  // -------------------------------------------------------------------------

  const orgMap = new Map<
    string,
    {
      reminder_30day: VGPScheduleWithAsset[];
      reminder_7day: VGPScheduleWithAsset[];
      reminder_1day: VGPScheduleWithAsset[];
      overdue: VGPScheduleWithAsset[];
    }
  >();

  for (const schedule of validSchedules) {
    const orgId = schedule.organization_id;
    const alertType = classifySchedule(schedule);

    if (!alertType) continue;

    if (!orgMap.has(orgId)) {
      orgMap.set(orgId, {
        reminder_30day: [],
        reminder_7day: [],
        reminder_1day: [],
        overdue: [],
      });
    }

    orgMap.get(orgId)![alertType].push(schedule);
  }

  console.log(`${LOG_PREFIX} ${orgMap.size} organizations have schedules requiring alerts`);

  // -------------------------------------------------------------------------
  // 4. Process each organization
  // -------------------------------------------------------------------------

  let totalEmailsSent = 0;

  for (const [orgId, buckets] of orgMap.entries()) {
    // Rate limit check
    if (totalEmailsSent >= MAX_EMAILS_PER_RUN) {
      console.log(`${LOG_PREFIX} Email limit reached during processing, stopping`);
      result.errors.push('Email limit reached mid-run');
      break;
    }

    const orgDetail: CronOrgDetail = {
      organization_id: orgId,
      organization_name: '',
      alerts: [],
    };

    // Get organization preferences
    const prefs = await getOrgNotificationPrefs(orgId);

    if (!prefs.enabled) {
      console.log(`${LOG_PREFIX} Org ${orgId}: alerts disabled, skipping`);
      continue;
    }

    // Get org name
    const { data: orgData } = await getAdminSupabase()
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    const orgName = orgData?.name || 'Organisation';
    orgDetail.organization_name = orgName;

    console.log(`${LOG_PREFIX} Processing org: ${orgName} (${orgId})`);

    // Get recipients
    const recipients = await getAlertRecipients(orgId);

    if (recipients.length === 0) {
      console.log(`${LOG_PREFIX} Org ${orgName}: no admin/manager recipients, skipping`);
      orgDetail.alerts.push({
        type: 'reminder_30day',
        count: 0,
        recipients: [],
        sent: false,
        error: 'No admin/manager recipients found',
      });
      result.details.push(orgDetail);
      continue;
    }

    const recipientEmails = recipients.map((r) => r.email);

    // Process each alert type
    const alertTypes: VGPAlertType[] = [
      'overdue',
      'reminder_1day',
      'reminder_7day',
      'reminder_30day',
    ];

    for (const alertType of alertTypes) {
      const schedulesForAlert = buckets[alertType];

      if (schedulesForAlert.length === 0) continue;

      // Check if this alert type is enabled in preferences
      const dayNumber = alertTypeToDayNumber(alertType);
      if (!prefs.alertDays.includes(dayNumber)) {
        console.log(
          `${LOG_PREFIX} Org ${orgName}: ${alertType} alerts disabled in preferences, skipping`
        );
        orgDetail.alerts.push({
          type: alertType,
          count: schedulesForAlert.length,
          recipients: recipientEmails,
          sent: false,
          error: 'Alert type disabled in preferences',
        });
        continue;
      }

      // Check for duplicates (already sent today)
      const scheduleIds = schedulesForAlert.map((s) => s.id);
      const unsent = await filterAlreadySentAlerts(scheduleIds, alertType);

      if (unsent.length === 0) {
        console.log(
          `${LOG_PREFIX} Org ${orgName}: all ${alertType} alerts already sent today, skipping`
        );
        orgDetail.alerts.push({
          type: alertType,
          count: schedulesForAlert.length,
          recipients: recipientEmails,
          sent: false,
          error: 'Already sent today',
        });
        continue;
      }

      // Filter to only unsent schedules
      const unsentSchedules = schedulesForAlert.filter((s) =>
        unsent.includes(s.id)
      );

      // Prepare table rows
      const tableRows = unsentSchedules.map(toTableRow);

      // Send email
      const sendResult = await sendVGPAlert(
        alertType,
        orgName,
        recipients,
        tableRows
      );

      orgDetail.alerts.push({
        type: alertType,
        count: unsentSchedules.length,
        recipients: recipientEmails,
        sent: sendResult.success,
        error: sendResult.error,
      });

      if (sendResult.success) {
        totalEmailsSent++;

        // Log the sent alerts
        await logEmailAlerts(
          unsentSchedules.map((s) => s.id),
          unsentSchedules.map((s) => s.asset_id),
          orgId,
          alertType,
          unsentSchedules.map((s) => s.next_due_date),
          recipientEmails
        );

        console.log(
          `${LOG_PREFIX} Org ${orgName}: sent ${alertType} for ${unsentSchedules.length} schedules`
        );
      } else {
        console.log(
          `${LOG_PREFIX} Org ${orgName}: FAILED to send ${alertType}: ${sendResult.error}`
        );
        result.errors.push(
          `Failed ${alertType} for ${orgName}: ${sendResult.error}`
        );
      }
    }

    result.details.push(orgDetail);
    result.organizations_processed++;
  }

  result.emails_sent = totalEmailsSent;

  const elapsed = Date.now() - startTime;
  console.log(
    `${LOG_PREFIX} === Cron Job Complete === ` +
    `Orgs: ${result.organizations_processed}, ` +
    `Emails: ${result.emails_sent}, ` +
    `Errors: ${result.errors.length}, ` +
    `Duration: ${elapsed}ms`
  );

  return result;
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  console.log(`${LOG_PREFIX} Cron endpoint called`);

  // Verify CRON_SECRET for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = CRON_SECRET;

  if (!cronSecret) {
    console.log(`${LOG_PREFIX} CRON_SECRET not configured`);
    return NextResponse.json(
      { error: 'Server configuration error: CRON_SECRET not set' },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.log(`${LOG_PREFIX} Unauthorized: invalid or missing CRON_SECRET`);
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const result = await runVGPAlertsCron();

    return NextResponse.json(result, {
      status: result.success ? 200 : 207,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`${LOG_PREFIX} Unhandled error: ${msg}`);

    return NextResponse.json(
      {
        success: false,
        error: msg,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Export the core logic so the manual trigger can reuse it
export { runVGPAlertsCron };