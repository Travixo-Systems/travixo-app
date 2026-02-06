// app/api/cron/vgp-alerts/route.ts
// Task-based VGP reminder system
// Keeps reminding at increasing frequency until inspection is resolved.
// Frequency: 30+ weekly, 15-30 twice/week, 7-15 every other day, <7 daily, overdue daily

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_EMAILS_PER_RUN = 80; // Resend free tier buffer

// Frequency rules: how many days must pass since last alert before we send again
type UrgencyLevel =
  | "planning"
  | "attention"
  | "urgent"
  | "critical"
  | "overdue";

interface FrequencyRule {
  level: UrgencyLevel;
  minDays: number; // inclusive lower bound (days until due)
  maxDays: number | null; // inclusive upper bound (null = no upper limit)
  cooldownDays: number; // min days between alerts for this schedule
  templateKey: string; // which email template to use
}

const FREQUENCY_RULES: FrequencyRule[] = [
  // Order matters: check from most urgent to least
  {
    level: "overdue",
    minDays: -Infinity,
    maxDays: -1,
    cooldownDays: 1,
    templateKey: "overdue",
  },
  {
    level: "critical",
    minDays: 0,
    maxDays: 6,
    cooldownDays: 1,
    templateKey: "1day",
  },
  {
    level: "urgent",
    minDays: 7,
    maxDays: 14,
    cooldownDays: 2,
    templateKey: "7day",
  },
  {
    level: "attention",
    minDays: 15,
    maxDays: 29,
    cooldownDays: 3,
    templateKey: "15day",
  },
  {
    level: "planning",
    minDays: 30,
    maxDays: 60,
    cooldownDays: 7,
    templateKey: "30day",
  },
];

function getUrgencyRule(daysUntilDue: number): FrequencyRule | null {
  for (const rule of FREQUENCY_RULES) {
    const minOk =
      daysUntilDue >= (rule.minDays === -Infinity ? -Infinity : rule.minDays);
    const maxOk = rule.maxDays === null || daysUntilDue <= rule.maxDays;
    if (minOk && maxOk) return rule;
  }
  return null; // More than 60 days out - no reminders yet
}

interface ScheduleWithAsset {
  id: string;
  asset_id: string;
  organization_id: string;
  next_due_date: string;
  interval_months: number;
  inspector_name: string | null;
  inspector_company: string | null;
  assets: {
    name: string;
    serial_number: string | null;
    category_id: string | null;
    current_location: string | null;
    asset_categories: { name: string } | null;
  };
}

interface OrgPreferences {
  vgp_alerts_enabled: boolean;
  vgp_alert_days: number[];
  notification_preferences: {
    recipients?: "owner" | "admin" | "all";
    digest_mode?: "individual" | "digest" | "realtime";
  } | null;
}

// ============================================================
// Core logic - exported for manual trigger import
// ============================================================
export async function runVGPAlertsCron(): Promise<{
  sent: number;
  skipped: number;
  cooldown: number;
  organizations: Array<{
    org: string;
    sent: number;
    skipped: number;
    cooldown: number;
  }>;
  timestamp: string;
}> {
  console.log("[VGP-CRON] Task-based reminder run starting...");

  // 1. Get all active schedules due within 60 days or overdue
  const today = new Date();
  const sixtyDaysOut = new Date(today);
  sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60);

<<<<<<< HEAD
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
    location: schedule.assets?.current_location || '-',
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
  if (days <= 15) return 'reminder_15day';
  if (days <= 30) return 'reminder_30day';

  return null; // Not due within 30 days
}

// ---------------------------------------------------------------------------
// Helper: Map alert type to the "day number" for preference checking
// ---------------------------------------------------------------------------

function alertTypeToDayNumber(alertType: VGPAlertType): number {
  switch (alertType) {
    case 'reminder_30day': return 30;
    case 'reminder_15day': return 15;
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
=======
  const { data: schedules, error: schedError } = (await supabase
    .from("vgp_schedules")
    .select(
      `
>>>>>>> 8f37a06 (refresh email aan notification reminder)
      id,
      asset_id,
      organization_id,
      next_due_date,
      interval_months,
      inspector_name,
      inspector_company,
      assets (
        name,
        serial_number,
<<<<<<< HEAD
        current_location,
        status,
=======
>>>>>>> 8f37a06 (refresh email aan notification reminder)
        category_id,
        current_location,
        asset_categories (
          name
        )
      )
    `,
    )
    .eq("status", "active")
    .lte("next_due_date", sixtyDaysOut.toISOString().split("T")[0])
    .is("archived_at", null)) as {
    data: ScheduleWithAsset[] | null;
    error: any;
  };

  if (schedError) {
    console.log("[VGP-CRON] Error querying schedules:", schedError.message);
    throw new Error(schedError.message);
  }

  if (!schedules || schedules.length === 0) {
    console.log("[VGP-CRON] No schedules due within 60 days. Done.");
    return {
      sent: 0,
      skipped: 0,
      cooldown: 0,
      organizations: [],
      timestamp: new Date().toISOString(),
    };
  }

  console.log(
    `[VGP-CRON] Found ${schedules.length} active schedules within 60-day window`,
  );

  // 2. Get last unresolved alert for each schedule
  const scheduleIds = schedules.map((s) => s.id);
  const { data: recentAlerts, error: alertsError } = await supabase
    .from("vgp_alerts")
    .select("schedule_id, sent_at, urgency_level")
    .in("schedule_id", scheduleIds)
    .eq("resolved", false)
    .order("sent_at", { ascending: false });

  if (alertsError) {
    console.log(
      "[VGP-CRON] Error querying recent alerts:",
      alertsError.message,
    );
    throw new Error(alertsError.message);
  }

  // Build a map: schedule_id -> most recent alert date
  const lastAlertMap = new Map<string, { sentAt: Date; level: string }>();
  for (const alert of recentAlerts || []) {
    if (!lastAlertMap.has(alert.schedule_id)) {
      lastAlertMap.set(alert.schedule_id, {
        sentAt: new Date(alert.sent_at),
        level: alert.urgency_level,
      });
    }
  }

  // 3. Group schedules by organization
  const orgSchedules = new Map<string, ScheduleWithAsset[]>();
  for (const schedule of schedules) {
    const orgId = schedule.organization_id;
    if (!orgSchedules.has(orgId)) {
      orgSchedules.set(orgId, []);
    }
    orgSchedules.get(orgId)!.push(schedule);
  }

  console.log(
    `[VGP-CRON] Schedules grouped into ${orgSchedules.size} organizations`,
  );

  // 4. Process each organization
  let totalSent = 0;
  let totalSkipped = 0;
  let totalCooldown = 0;
  const results: Array<{
    org: string;
    sent: number;
    skipped: number;
    cooldown: number;
  }> = [];

  for (const [orgId, orgScheds] of orgSchedules) {
    // Check org notification preferences
    const { data: org, error: orgError } = (await supabase
      .from("organizations")
      .select(
        "id, name, vgp_alerts_enabled, vgp_alert_days, notification_preferences",
      )
      .eq("id", orgId)
      .single()) as {
      data: (OrgPreferences & { id: string; name: string }) | null;
      error: any;
    };

    if (orgError || !org) {
      console.log(
        `[VGP-CRON] Could not fetch org ${orgId}:`,
        orgError?.message,
      );
      continue;
    }

    if (!org.vgp_alerts_enabled) {
      console.log(`[VGP-CRON] Alerts disabled for org: ${org.name}`);
      totalSkipped += orgScheds.length;
      continue;
    }

    // Get recipients based on org preferences
    const recipients = await getAlertRecipients(
      orgId,
      org.notification_preferences,
    );
    if (recipients.length === 0) {
      console.log(`[VGP-CRON] No recipients found for org: ${org.name}`);
      totalSkipped += orgScheds.length;
      continue;
    }

    // Determine which schedules need an alert NOW
    const schedulesToAlert: Array<{
      schedule: ScheduleWithAsset;
      rule: FrequencyRule;
      daysUntilDue: number;
    }> = [];

    for (const schedule of orgScheds) {
      const dueDate = new Date(schedule.next_due_date);
      const daysUntilDue = Math.floor(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      const rule = getUrgencyRule(daysUntilDue);
      if (!rule) {
        // More than 60 days out, skip
        continue;
      }

      // Check if org has this alert type enabled
      // Map urgency levels to the vgp_alert_days preference
      // vgp_alert_days contains values like [30, 15, 7, 1, 0] where 0 = overdue
      const alertDayMapping: Record<UrgencyLevel, number> = {
        planning: 30,
        attention: 15,
        urgent: 7,
        critical: 1,
        overdue: 0,
      };
      const mappedDay = alertDayMapping[rule.level];
      if (org.vgp_alert_days && !org.vgp_alert_days.includes(mappedDay)) {
        // Org has disabled this urgency level
        totalSkipped++;
        continue;
      }

      // Check cooldown: has enough time passed since the last alert?
      const lastAlert = lastAlertMap.get(schedule.id);
      if (lastAlert) {
        const daysSinceLastAlert = Math.floor(
          (today.getTime() - lastAlert.sentAt.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        if (daysSinceLastAlert < rule.cooldownDays) {
          totalCooldown++;
          continue;
        }
      }

      schedulesToAlert.push({ schedule, rule, daysUntilDue });

      if (totalSent + schedulesToAlert.length >= MAX_EMAILS_PER_RUN) {
        console.log("[VGP-CRON] Approaching email limit, stopping collection");
        break;
      }
    }

    if (schedulesToAlert.length === 0) {
      continue;
    }

    // Group by urgency level for digest emails
    const byUrgency = new Map<UrgencyLevel, typeof schedulesToAlert>();
    for (const item of schedulesToAlert) {
      const level = item.rule.level;
      if (!byUrgency.has(level)) {
        byUrgency.set(level, []);
      }
      byUrgency.get(level)!.push(item);
    }

    let orgSent = 0;
    let orgSkipped = 0;

    // Send one email per urgency level (digest approach)
    for (const [level, items] of byUrgency) {
      const templateKey = items[0].rule.templateKey;

      try {
        // Import and send email template
        const { sendVGPAlert } = await import("@/lib/email/email-service");
        await sendVGPAlert(
          templateKey as any,
          orgId,
          items.map((i) => ({
            ...i.schedule,
            days_until_due: i.daysUntilDue,
          })),
          recipients,
        );

        // Log each schedule alert in vgp_alerts
        for (const item of items) {
          await supabase.from("vgp_alerts").insert({
            schedule_id: item.schedule.id,
            organization_id: orgId,
            alert_type: templateKey,
            urgency_level: level,
            sent: true,
            sent_at: new Date().toISOString(),
            email_sent_to: recipients,
            resolved: false,
          });
        }

        orgSent += items.length;
        console.log(
          `[VGP-CRON] Sent ${level} alert for ${items.length} schedules to ${org.name}`,
        );
      } catch (emailError: any) {
        console.log(
          `[VGP-CRON] Failed to send ${level} alert for ${org.name}:`,
          emailError.message,
        );
        orgSkipped += items.length;
      }
    }

    totalSent += orgSent;
    totalSkipped += orgSkipped;
    results.push({
      org: org.name,
      sent: orgSent,
      skipped: orgSkipped,
      cooldown: 0,
    });
  }

  const summary = {
    sent: totalSent,
    skipped: totalSkipped,
    cooldown: totalCooldown,
    organizations: results,
    timestamp: new Date().toISOString(),
  };

  console.log("[VGP-CRON] Run complete:", JSON.stringify(summary));
  return summary;
}

// ============================================================
// GET handler - called by Vercel Cron, protected by CRON_SECRET
// ============================================================
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log("[VGP-CRON] Unauthorized request - invalid CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runVGPAlertsCron();
    return NextResponse.json(summary);
  } catch (error: any) {
    console.log("[VGP-CRON] Unexpected error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================
// Helper: get email recipients based on org preferences
// ============================================================
async function getAlertRecipients(
  orgId: string,
  prefs: OrgPreferences["notification_preferences"],
): Promise<string[]> {
  const recipientPref = prefs?.recipients || "admin";

  let query = supabase.from("users").select("email").eq("company_id", orgId);

  if (recipientPref === "owner") {
    query = query.eq("role", "owner");
  } else if (recipientPref === "admin") {
    query = query.in("role", ["owner", "admin"]);
  }
  // 'all' = no role filter

  const { data: users, error } = query;

  if (error || !users) {
    console.log(
      `[VGP-CRON] Error fetching recipients for org ${orgId}:`,
      error?.message,
    );
    return [];
  }

  return users.map((u: { email: string }) => u.email).filter(Boolean);
}
