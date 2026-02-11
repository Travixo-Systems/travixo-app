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
// Client Recall Pass
// Finds equipment currently rented out that has VGP due within
// 30 or 14 days, and sends recall notifications to the org.
// ============================================================

interface RecallResult {
  organizations_processed: number;
  recall_emails_sent: number;
  recall_items_found: number;
  errors: string[];
}

async function runClientRecallPass(): Promise<RecallResult> {
  const RECALL_PREFIX = "[RECALL]";
  console.log(`${RECALL_PREFIX} Starting client recall pass...`);

  const result: RecallResult = {
    organizations_processed: 0,
    recall_emails_sent: 0,
    recall_items_found: 0,
    errors: [],
  };

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find active rentals where the rented asset has a VGP schedule due within 30 days
    const thirtyDaysOut = new Date(today);
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

    const { data: rentalSchedules, error: queryError } = await supabase
      .from("rentals")
      .select(`
        id,
        asset_id,
        organization_id,
        client_name,
        client_id,
        checkout_date,
        expected_return_date,
        assets (
          name,
          serial_number,
          category_id,
          asset_categories (
            name
          )
        )
      `)
      .eq("status", "active") as { data: any[] | null; error: any };

    if (queryError) {
      console.log(`${RECALL_PREFIX} Error querying active rentals:`, queryError.message);
      result.errors.push(`Rental query error: ${queryError.message}`);
      return result;
    }

    if (!rentalSchedules || rentalSchedules.length === 0) {
      console.log(`${RECALL_PREFIX} No active rentals found. Done.`);
      return result;
    }

    console.log(`${RECALL_PREFIX} Found ${rentalSchedules.length} active rentals`);

    // For each rental, check if its asset has a VGP schedule due within 30 days
    const assetIds = rentalSchedules.map((r: any) => r.asset_id);

    const { data: vgpSchedules, error: vgpError } = await supabase
      .from("vgp_schedules")
      .select("id, asset_id, next_due_date")
      .in("asset_id", assetIds)
      .eq("status", "active")
      .is("archived_at", null)
      .lte("next_due_date", thirtyDaysOut.toISOString().split("T")[0]);

    if (vgpError) {
      console.log(`${RECALL_PREFIX} Error querying VGP schedules:`, vgpError.message);
      result.errors.push(`VGP schedule query error: ${vgpError.message}`);
      return result;
    }

    if (!vgpSchedules || vgpSchedules.length === 0) {
      console.log(`${RECALL_PREFIX} No rented assets with upcoming VGP. Done.`);
      return result;
    }

    // Build asset_id -> VGP schedule map
    const vgpMap = new Map<string, { scheduleId: string; nextDueDate: string }>();
    for (const vs of vgpSchedules) {
      vgpMap.set(vs.asset_id, { scheduleId: vs.id, nextDueDate: vs.next_due_date });
    }

    // Match rentals with their VGP schedules
    interface RecallItem {
      rental: any;
      vgpScheduleId: string;
      nextDueDate: string;
      daysUntilDue: number;
      alertType: "recall_30day" | "recall_14day";
    }

    const recallItems: RecallItem[] = [];

    for (const rental of rentalSchedules) {
      const vgp = vgpMap.get(rental.asset_id);
      if (!vgp) continue;

      const dueDate = new Date(vgp.nextDueDate);
      dueDate.setHours(0, 0, 0, 0);
      const daysUntilDue = Math.floor(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Only process if within 30 days
      if (daysUntilDue > 30) continue;

      const alertType: "recall_30day" | "recall_14day" =
        daysUntilDue <= 14 ? "recall_14day" : "recall_30day";

      recallItems.push({
        rental,
        vgpScheduleId: vgp.scheduleId,
        nextDueDate: vgp.nextDueDate,
        daysUntilDue,
        alertType,
      });
    }

    result.recall_items_found = recallItems.length;

    if (recallItems.length === 0) {
      console.log(`${RECALL_PREFIX} No recall items after filtering. Done.`);
      return result;
    }

    console.log(`${RECALL_PREFIX} ${recallItems.length} items need recall alerts`);

    // Check dedup: filter out already-sent alerts
    const rentalIds = recallItems.map((ri) => ri.rental.id);
    const { data: existingAlerts } = await supabase
      .from("client_recall_alerts")
      .select("rental_id, alert_type, next_due_date")
      .in("rental_id", rentalIds)
      .eq("sent", true);

    const sentSet = new Set(
      (existingAlerts || []).map(
        (a: any) => `${a.rental_id}:${a.alert_type}:${a.next_due_date}`
      )
    );

    const newItems = recallItems.filter(
      (ri) => !sentSet.has(`${ri.rental.id}:${ri.alertType}:${ri.nextDueDate}`)
    );

    if (newItems.length === 0) {
      console.log(`${RECALL_PREFIX} All recall alerts already sent. Done.`);
      return result;
    }

    console.log(`${RECALL_PREFIX} ${newItems.length} new recall alerts to send`);

    // Group by organization
    const orgItems = new Map<string, RecallItem[]>();
    for (const item of newItems) {
      const orgId = item.rental.organization_id;
      if (!orgItems.has(orgId)) orgItems.set(orgId, []);
      orgItems.get(orgId)!.push(item);
    }

    // Process each org
    for (const [orgId, items] of orgItems) {
      const { orgName, prefs } = await getOrgNotificationPrefs(orgId);

      if (!prefs || !prefs.enabled) {
        console.log(`${RECALL_PREFIX} Alerts disabled for org: ${orgName}`);
        continue;
      }

      const recipients = await getAlertRecipients(orgId, prefs.recipients);
      if (recipients.length === 0) {
        console.log(`${RECALL_PREFIX} No recipients for org: ${orgName}`);
        continue;
      }

      // Split by alert type
      const by30 = items.filter((i) => i.alertType === "recall_30day");
      const by14 = items.filter((i) => i.alertType === "recall_14day");

      for (const [alertType, batch] of [
        ["recall_30day", by30],
        ["recall_14day", by14],
      ] as const) {
        if (batch.length === 0) continue;

        // Format date as DD/MM/YYYY
        const formatDate = (d: string) => {
          try {
            const [y, m, day] = d.split("-");
            return `${day}/${m}/${y}`;
          } catch {
            return d;
          }
        };

        const tableRows = batch.map((item) => ({
          assetName: item.rental.assets?.name || "Equipement inconnu",
          serialNumber: item.rental.assets?.serial_number || "-",
          category: item.rental.assets?.asset_categories?.name || "-",
          clientName: item.rental.client_name,
          checkoutDate: formatDate(
            item.rental.checkout_date.split("T")[0]
          ),
          vgpDueDate: formatDate(item.nextDueDate),
          daysUntilDue: item.daysUntilDue,
        }));

        try {
          const { sendClientRecallEmail } = await import(
            "@/lib/email/email-service"
          );

          const sendResult = await sendClientRecallEmail(
            alertType,
            orgName,
            recipients,
            tableRows
          );

          if (sendResult.success) {
            result.recall_emails_sent++;

            // Log dedup records
            const now = new Date().toISOString();
            const recipientEmails = recipients.map((r) => r.email);

            for (const item of batch) {
              await supabase.from("client_recall_alerts").insert({
                organization_id: orgId,
                rental_id: item.rental.id,
                client_id: item.rental.client_id || null,
                asset_id: item.rental.asset_id,
                alert_type: alertType,
                vgp_schedule_id: item.vgpScheduleId,
                next_due_date: item.nextDueDate,
                sent: true,
                sent_at: now,
                email_sent_to: recipientEmails,
              });
            }

            console.log(
              `${RECALL_PREFIX} Sent ${alertType} for ${batch.length} items to ${orgName}`
            );
          } else {
            console.log(
              `${RECALL_PREFIX} Failed ${alertType} for ${orgName}: ${sendResult.error}`
            );
            result.errors.push(`Failed ${alertType} for ${orgName}: ${sendResult.error}`);
          }
        } catch (e: any) {
          console.log(`${RECALL_PREFIX} Exception: ${e.message}`);
          result.errors.push(`Exception ${alertType} for ${orgName}: ${e.message}`);
        }
      }

      result.organizations_processed++;
    }
  } catch (error: any) {
    console.log(`[RECALL] Unexpected error:`, error.message);
    result.errors.push(`Unexpected error: ${error.message}`);
  }

  console.log(`[RECALL] Pass complete:`, JSON.stringify(result, null, 2));
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
    // Run VGP alerts first
    const vgpResult = await runVGPAlertsCron();

    // Then run client recall pass
    const recallResult = await runClientRecallPass();

    const combined = {
      ...vgpResult,
      recall: recallResult,
    };

    return NextResponse.json(combined, { status: vgpResult.success ? 200 : 207 });
  } catch (error: any) {
    console.log(`${LOG_PREFIX} Unexpected error:`, error.message);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
