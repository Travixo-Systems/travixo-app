// app/api/cron/vgp-alerts/route.ts
// Task-based VGP reminder system with cooldowns
// Keeps reminding at increasing frequency until inspection is resolved.
// Frequency: 30-60 weekly, 15-29 twice/week, 7-14 every other day, 0-6 daily, overdue daily

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type {
  VGPAlertType,
  ScheduleTableRow,
  EmailRecipient,
} from "@/types/vgp-alerts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_EMAILS_PER_RUN = 80;
const LOG_PREFIX = "[VGP-CRON]";

// ============================================================
// Urgency / frequency configuration
// ============================================================

type UrgencyLevel = "planning" | "attention" | "urgent" | "critical" | "overdue";

interface FrequencyRule {
  level: UrgencyLevel;
  minDays: number;
  maxDays: number | null;
  cooldownDays: number;
  alertType: VGPAlertType;
  preferenceDay: number; // Maps to timing preference array
}

const FREQUENCY_RULES: FrequencyRule[] = [
  { level: "overdue",   minDays: -Infinity, maxDays: -1,   cooldownDays: 1, alertType: "overdue",        preferenceDay: 0 },
  { level: "critical",  minDays: 0,         maxDays: 6,    cooldownDays: 1, alertType: "reminder_1day",  preferenceDay: 1 },
  { level: "urgent",    minDays: 7,         maxDays: 14,   cooldownDays: 2, alertType: "reminder_7day",  preferenceDay: 7 },
  { level: "attention", minDays: 15,        maxDays: 29,   cooldownDays: 3, alertType: "reminder_15day", preferenceDay: 15 },
  { level: "planning",  minDays: 30,        maxDays: 60,   cooldownDays: 7, alertType: "reminder_30day", preferenceDay: 30 },
];

function getUrgencyRule(daysUntilDue: number): FrequencyRule | null {
  for (const rule of FREQUENCY_RULES) {
    const minOk = daysUntilDue >= (rule.minDays === -Infinity ? -Infinity : rule.minDays);
    const maxOk = rule.maxDays === null || daysUntilDue <= rule.maxDays;
    if (minOk && maxOk) return rule;
  }
  return null; // More than 60 days out
}

// ============================================================
// Supabase query result shape
// ============================================================

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

// ============================================================
// Helper: format date as DD/MM/YYYY for email display
// ============================================================

function formatDateFR(isoDate: string): string {
  try {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return isoDate;
  }
}

// ============================================================
// Helper: transform Supabase row → ScheduleTableRow for email
// ============================================================

function toScheduleTableRow(
  schedule: ScheduleWithAsset,
  daysUntilDue: number
): ScheduleTableRow {
  return {
    assetName: schedule.assets?.name || "Equipement inconnu",
    serialNumber: schedule.assets?.serial_number || "-",
    category: schedule.assets?.asset_categories?.name || "-",
    location: schedule.assets?.current_location || "-",
    dueDate: formatDateFR(schedule.next_due_date),
    daysRemaining: daysUntilDue,
  };
}

// ============================================================
// Helper: Get org notification preferences from JSONB column
// ============================================================

interface OrgNotificationPrefs {
  enabled: boolean;
  timing: number[];
  recipients: "owner" | "admin" | "all";
}

async function getOrgNotificationPrefs(orgId: string): Promise<{
  orgName: string;
  prefs: OrgNotificationPrefs | null
}> {
  const { data: org, error } = await supabase
    .from("organizations")
    .select("name, notification_preferences")
    .eq("id", orgId)
    .single();

  if (error || !org) {
    console.log(`${LOG_PREFIX} Could not fetch org ${orgId}:`, error?.message);
    return { orgName: "Unknown", prefs: null };
  }

  const np = org.notification_preferences;

  // Check if preferences exist and are properly structured
  if (!np) {
    // No preferences set, use defaults
    return {
      orgName: org.name,
      prefs: { enabled: true, timing: [30, 15, 7, 1], recipients: "owner" }
    };
  }

  // Read from notification_preferences JSONB structure
  const emailEnabled = np.email_enabled ?? true;
  const vgpEnabled = np.vgp_alerts?.enabled ?? true;
  const timing = Array.isArray(np.vgp_alerts?.timing) ? np.vgp_alerts.timing : [30, 15, 7, 1];
  const recipients = np.vgp_alerts?.recipients || "owner";

  return {
    orgName: org.name,
    prefs: {
      enabled: emailEnabled && vgpEnabled,
      timing,
      recipients,
    }
  };
}

// ============================================================
// Helper: get email recipients based on org preferences
// ============================================================

async function getAlertRecipients(
  orgId: string,
  recipientsPref: "owner" | "admin" | "all"
): Promise<EmailRecipient[]> {
  let roles: string[];
  switch (recipientsPref) {
    case "all":
      roles = ["owner", "admin", "manager"];
      break;
    case "admin":
      roles = ["owner", "admin"];
      break;
    case "owner":
    default:
      roles = ["owner"];
      break;
  }

  const { data: users, error } = await supabase
    .from("users")
    .select("email, full_name")
    .eq("organization_id", orgId)
    .in("role", roles);

  if (error || !users) {
    console.log(`${LOG_PREFIX} Error fetching recipients for org ${orgId}:`, error?.message);
    return [];
  }

  return users.map((u: { email: string; full_name: string | null }) => ({
    email: u.email,
    full_name: u.full_name || "",
  }));
}

// ============================================================
// Core logic - exported so manual trigger can call it directly
// ============================================================

export interface CronResult {
  success: boolean;
  timestamp: string;
  organizations_processed: number;
  emails_sent: number;
  skipped: number;
  cooldown: number;
  errors: string[];
  details: Array<{
    organization_id: string;
    organization_name: string;
    sent: number;
    skipped: number;
    cooldown: number;
  }>;
}

export async function runVGPAlertsCron(): Promise<CronResult> {
  console.log(`${LOG_PREFIX} Task-based reminder run starting...`);

  const result: CronResult = {
    success: true,
    timestamp: new Date().toISOString(),
    organizations_processed: 0,
    emails_sent: 0,
    skipped: 0,
    cooldown: 0,
    errors: [],
    details: [],
  };

  try {
    // 1. Get all active schedules due within 60 days or overdue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixtyDaysOut = new Date(today);
    sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60);

    const { data: schedules, error: schedError } = await supabase
      .from("vgp_schedules")
      .select(`
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
          category_id,
          current_location,
          asset_categories (
            name
          )
        )
      `)
      .eq("status", "active")
      .lte("next_due_date", sixtyDaysOut.toISOString().split("T")[0])
      .is("archived_at", null) as { data: ScheduleWithAsset[] | null; error: any };

    if (schedError) {
      console.log(`${LOG_PREFIX} Error querying schedules:`, schedError.message);
      result.success = false;
      result.errors.push(`Database query error: ${schedError.message}`);
      return result;
    }

    if (!schedules || schedules.length === 0) {
      console.log(`${LOG_PREFIX} No schedules due within 60 days. Done.`);
      return result;
    }

    console.log(`${LOG_PREFIX} Found ${schedules.length} active schedules within 60-day window`);

    // 2. Get last unresolved alert for each schedule (for cooldown checking)
    const scheduleIds = schedules.map((s) => s.id);
    const { data: recentAlerts, error: alertsError } = await supabase
      .from("vgp_alerts")
      .select("schedule_id, sent_at")
      .in("schedule_id", scheduleIds)
      .eq("sent", true)
      .eq("resolved", false)
      .order("sent_at", { ascending: false });

    if (alertsError) {
      console.log(`${LOG_PREFIX} Error querying recent alerts:`, alertsError.message);
      result.success = false;
      result.errors.push(`Alerts query error: ${alertsError.message}`);
      return result;
    }

    // Build map: schedule_id -> most recent alert date
    const lastAlertMap = new Map<string, Date>();
    for (const alert of recentAlerts || []) {
      if (!lastAlertMap.has(alert.schedule_id)) {
        lastAlertMap.set(alert.schedule_id, new Date(alert.sent_at));
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

    console.log(`${LOG_PREFIX} Schedules grouped into ${orgSchedules.size} organizations`);

    // 4. Process each organization
    for (const [orgId, orgScheds] of orgSchedules) {
      // Fetch org preferences from JSONB column
      const { orgName, prefs } = await getOrgNotificationPrefs(orgId);

      if (!prefs || !prefs.enabled) {
        console.log(`${LOG_PREFIX} Alerts disabled for org: ${orgName}`);
        result.skipped += orgScheds.length;
        continue;
      }

      // Get recipients
      const recipients = await getAlertRecipients(orgId, prefs.recipients);
      if (recipients.length === 0) {
        console.log(`${LOG_PREFIX} No recipients found for org: ${orgName}`);
        result.skipped += orgScheds.length;
        continue;
      }

      const orgDetail = {
        organization_id: orgId,
        organization_name: orgName,
        sent: 0,
        skipped: 0,
        cooldown: 0,
      };

      // Determine which schedules need an alert NOW
      const schedulesToAlert: Array<{
        schedule: ScheduleWithAsset;
        rule: FrequencyRule;
        daysUntilDue: number;
      }> = [];

      for (const schedule of orgScheds) {
        const dueDate = new Date(schedule.next_due_date);
        dueDate.setHours(0, 0, 0, 0);
        const daysUntilDue = Math.floor(
          (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        const rule = getUrgencyRule(daysUntilDue);
        if (!rule) {
          orgDetail.skipped++;
          continue;
        }

        // Check if org has this alert type enabled via timing preferences
        // Overdue alerts (preferenceDay: 0) are always sent
        if (rule.preferenceDay !== 0 && !prefs.timing.includes(rule.preferenceDay)) {
          console.log(`${LOG_PREFIX} ${orgName}: ${rule.level} alerts disabled in preferences`);
          orgDetail.skipped++;
          continue;
        }

        // Check cooldown
        const lastAlertDate = lastAlertMap.get(schedule.id);
        if (lastAlertDate) {
          const daysSinceLastAlert = Math.floor(
            (today.getTime() - lastAlertDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceLastAlert < rule.cooldownDays) {
            console.log(
              `${LOG_PREFIX} ${orgName}: ${schedule.assets?.name} in cooldown ` +
              `(${daysSinceLastAlert}d < ${rule.cooldownDays}d)`
            );
            orgDetail.cooldown++;
            continue;
          }
        }

        schedulesToAlert.push({ schedule, rule, daysUntilDue });

        if (result.emails_sent + schedulesToAlert.length >= MAX_EMAILS_PER_RUN) {
          console.log(`${LOG_PREFIX} Approaching email limit, stopping collection`);
          break;
        }
      }

      if (schedulesToAlert.length === 0) {
        result.details.push(orgDetail);
        result.organizations_processed++;
        continue;
      }

      // Group by urgency level for digest emails
      const byUrgency = new Map<UrgencyLevel, typeof schedulesToAlert>();
      for (const item of schedulesToAlert) {
        const level = item.rule.level;
        if (!byUrgency.has(level)) byUrgency.set(level, []);
        byUrgency.get(level)!.push(item);
      }

      for (const [level, items] of byUrgency) {
        const alertType = items[0].rule.alertType;

        // Transform to ScheduleTableRow shape
        const scheduleRows: ScheduleTableRow[] = items.map((i) =>
          toScheduleTableRow(i.schedule, i.daysUntilDue)
        );

        try {
          const { sendVGPAlert } = await import("@/lib/email/email-service");

          const sendResult = await sendVGPAlert(
            alertType,
            orgName,
            recipients,
            scheduleRows
          );

          if (!sendResult.success) {
            console.log(`${LOG_PREFIX} Failed to send ${level} alert for ${orgName}: ${sendResult.error}`);
            result.errors.push(`Failed ${alertType} for ${orgName}: ${sendResult.error}`);
            orgDetail.skipped += items.length;
            continue;
          }

          // Log alerts with urgency_level and resolved fields
          const now = new Date().toISOString();
          const todayStr = now.split("T")[0];
          const recipientEmails = recipients.map(r => r.email);

          for (const item of items) {
            const { error: insertError } = await supabase.from("vgp_alerts").insert({
              schedule_id: item.schedule.id,
              asset_id: item.schedule.asset_id,
              organization_id: orgId,
              alert_type: alertType,
              urgency_level: item.rule.level,
              alert_date: todayStr,
              due_date: item.schedule.next_due_date,
              sent: true,
              sent_at: now,
              email_sent_to: recipientEmails,
              resolved: false,
            });

            if (insertError) {
              console.log(`${LOG_PREFIX} Failed to log alert: ${insertError.message}`);
            }
          }

          orgDetail.sent += items.length;
          result.emails_sent++;
          console.log(
            `${LOG_PREFIX} Sent ${level} (${alertType}) alert for ${items.length} schedules to ${orgName}`
          );
        } catch (emailError: any) {
          console.log(
            `${LOG_PREFIX} Exception sending ${level} alert for ${orgName}: ${emailError.message}`
          );
          result.errors.push(`Exception ${alertType} for ${orgName}: ${emailError.message}`);
          orgDetail.skipped += items.length;
        }
      }

      result.skipped += orgDetail.skipped;
      result.cooldown += orgDetail.cooldown;
      result.details.push(orgDetail);
      result.organizations_processed++;
    }

  } catch (error: any) {
    console.log(`${LOG_PREFIX} Unexpected error:`, error.message);
    result.success = false;
    result.errors.push(`Unexpected error: ${error.message}`);
  }

  console.log(`${LOG_PREFIX} Run complete:`, JSON.stringify(result, null, 2));
  return result;
}

// ============================================================
// GET handler - called by Vercel Cron, protected by CRON_SECRET
// ============================================================

export async function GET(request: Request) {
  console.log(`${LOG_PREFIX} Cron endpoint called`);

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log(`${LOG_PREFIX} Unauthorized request - invalid CRON_SECRET`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runVGPAlertsCron();
    return NextResponse.json(result, { status: result.success ? 200 : 207 });
  } catch (error: any) {
    console.log(`${LOG_PREFIX} Unexpected error:`, error.message);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
