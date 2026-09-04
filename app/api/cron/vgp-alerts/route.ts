// app/api/cron/vgp-alerts/route.ts
// Task-based VGP reminder system with cooldowns
// Keeps reminding at increasing frequency until inspection is resolved.
// Frequency: 30-60 weekly, 15-29 twice/week, 7-14 every other day, 0-6 daily, overdue daily

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/node";

/**
 * This route walks every organization, sends their digests, and then runs a
 * second pass for client recalls. With no ceiling declared it inherited the
 * platform default, and a single slow org could consume the whole invocation
 * -- every org queued behind it lost its alerts for that day, silently.
 *
 * 300s is the current platform maximum. It is a backstop, not a target: the
 * per-email timeout in lib/email/email-service.ts is what actually keeps a
 * hung recipient from eating the run.
 */
export const maxDuration = 300;

import type {
  VGPAlertType,
  ScheduleTableRow,
  EmailRecipient,
} from "@/types/vgp-alerts";

import { isDemoSchedule, isUndeliverableEmail } from "@/lib/vgp/demo-exclusion";
import {
  resolveRecipientPreference,
  planDelivery,
  countItems,
  normalizeRecipientsPref,
  type PendingAlertGroup,
  type UserNotificationPreferenceRow,
} from "@/lib/vgp/notification-routing";

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
    /** Nullable in the database, so NULL means "not marked demo", not "demo". */
    is_demo_data: boolean | null;
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
    assetName: schedule.assets?.name || "Équipement inconnu",
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

  // The column stores this key as an array when written by the database default
  // and as a string when written by the settings API. Reading it as a scalar
  // meant array rows matched no case in getAlertRecipients' switch and fell
  // through to owner-only -- correct by accident for ["owner"], and a silent
  // narrowing for ["admin"] and ["all"]. Migration 20260902170000 repairs the
  // stored data; this keeps the read correct regardless.
  const recipients = normalizeRecipientsPref(np.vgp_alerts?.recipients);

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
): Promise<{ recipients: EmailRecipient[]; filtered: number }> {
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
    return { recipients: [], filtered: 0 };
  }

  const all = users.map((u: { email: string; full_name: string | null }) => ({
    email: u.email,
    full_name: u.full_name || "",
  }));

  // Drop addresses that cannot possibly be delivered before they reach Resend.
  //
  // scripts/seed-complete-test-data.ts writes five accounts per seeded org as
  // `user{i}@{slug}.test`, with i=0 owner and i=1 admin -- precisely the roles
  // selected above. `.test` is reserved by RFC 2606 and never resolves, so each
  // one is a guaranteed hard bounce, every day, charged against the sending
  // domain's reputation. Nothing downstream can recover from that, so the
  // filter belongs here rather than in the send path.
  const recipients = all.filter((r) => !isUndeliverableEmail(r.email));
  const filtered = all.length - recipients.length;

  if (filtered > 0) {
    console.log(
      `${LOG_PREFIX} Filtered ${filtered} undeliverable recipient(s) for org ${orgId} ` +
      `(reserved .test domain or blank address)`
    );
  }

  return { recipients, filtered };
}

// ============================================================
// Helper: per-user notification preferences for one organization
// ============================================================

/**
 * Load every user preference row for an org, keyed by email.
 *
 * One query per org rather than one per recipient: an org with "all" selected
 * can have dozens of members, and this runs inside a loop over every org in the
 * system. Missing rows are simply absent from the map -- resolveRecipientPreference
 * treats that as "use org defaults", which is the intended meaning.
 *
 * A query failure returns an empty map, so every recipient falls back to org
 * defaults. That is the safe direction: alerts still go out, at the frequency
 * the org configured, rather than being silently suppressed by an unrelated
 * database problem.
 */
async function getUserPreferencesByEmail(
  orgId: string
): Promise<Map<string, UserNotificationPreferenceRow>> {
  const byEmail = new Map<string, UserNotificationPreferenceRow>();

  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select("user_id, organization_id, vgp_frequency, vgp_thresholds, users!inner(email)")
    .eq("organization_id", orgId);

  if (error) {
    console.log(
      `${LOG_PREFIX} Could not load user preferences for org ${orgId}: ${error.message}. ` +
      `Falling back to org defaults for every recipient.`
    );
    Sentry.captureException(error, {
      tags: { area: "vgp_cron", step: "user_prefs_load" },
      extra: { orgId },
    });
    return byEmail;
  }

  type PrefRowWithUser = UserNotificationPreferenceRow & {
    users: { email: string } | null;
  };

  for (const row of (data || []) as unknown as PrefRowWithUser[]) {
    const email: string | undefined = row.users?.email;
    if (!email) continue;
    byEmail.set(email.toLowerCase(), {
      user_id: row.user_id,
      organization_id: row.organization_id,
      vgp_frequency: row.vgp_frequency,
      vgp_thresholds: row.vgp_thresholds,
    });
  }

  return byEmail;
}

// ============================================================
// Per-recipient delivery
// ============================================================

type ClaimedItem = {
  schedule: ScheduleWithAsset;
  rule: FrequencyRule;
  daysUntilDue: number;
};

/**
 * One row returned by the claim_vgp_alerts RPC.
 *
 * out_* rather than id/schedule_id because every RETURNS TABLE column is an
 * in-scope PL/pgSQL variable, and a bare `sent` in the ON CONFLICT predicate
 * would be ambiguous against the table column.
 */
type ClaimedAlertRow = { out_id: string; out_schedule_id: string };

interface DeliveryOutcome {
  emailsSent: number;
  weeklyQueued: number;
  recipientsOff: number;
  errors: string[];
}

/**
 * Deliver a set of claimed alert bands to each recipient according to their own
 * preferences.
 *
 * Each recipient is handled independently: one person's failure does not
 * suppress anyone else's mail, and one person's 'off' does not affect the rest.
 * This is the behavioural centre of the feature, and the reason planDelivery()
 * is a pure function -- the routing decisions are unit-tested in
 * scripts/verify/verify-n4-routing.mjs, leaving this function responsible only
 * for I/O.
 */
async function deliverToRecipients(params: {
  orgId: string;
  orgName: string;
  recipients: EmailRecipient[];
  userPrefs: Map<string, UserNotificationPreferenceRow>;
  orgDefaults: { timing: number[]; enabled: boolean };
  groups: PendingAlertGroup<ClaimedItem>[];
  allClaimedRowIds: string[];
}): Promise<DeliveryOutcome> {
  const { orgId, orgName, recipients, userPrefs, orgDefaults, groups } = params;
  const outcome: DeliveryOutcome = {
    emailsSent: 0,
    weeklyQueued: 0,
    recipientsOff: 0,
    errors: [],
  };

  const { sendVGPAlert, sendVGPDailyDigest } = await import("@/lib/email/email-service");

  let anyoneReceivedSomething = false;

  for (const recipient of recipients) {
    const prefRow = userPrefs.get(recipient.email.toLowerCase());
    const preference = resolveRecipientPreference(prefRow, orgDefaults);
    const plan = planDelivery(groups, preference);

    if (preference.frequency === "off") {
      outcome.recipientsOff++;
      console.log(`${LOG_PREFIX} ${orgName}: ${recipient.email} has alerts off, skipping`);
      continue;
    }

    if (plan.silent) {
      console.log(
        `${LOG_PREFIX} ${orgName}: ${recipient.email} matched no enabled threshold ` +
        `(${plan.skippedByThreshold.length} band(s) filtered out)`
      );
      continue;
    }

    // --- immediate: one email per band, the pre-feature behaviour ---
    for (const group of plan.immediate) {
      const rows: ScheduleTableRow[] = group.items.map((i) =>
        toScheduleTableRow(i.schedule, i.daysUntilDue)
      );
      // Subject wording depends on how far out the soonest item actually is,
      // not on the band's nominal name. See SUBJECT_LINES in email-service.
      const soonest = Math.min(...group.items.map((i) => i.daysUntilDue));

      try {
        const res = await sendVGPAlert(
          group.alertType as VGPAlertType,
          orgName,
          [recipient],
          rows,
          soonest
        );
        if (res.success) {
          outcome.emailsSent++;
          anyoneReceivedSomething = true;
        } else {
          outcome.errors.push(
            `Immediate ${group.alertType} to ${recipient.email} failed: ${res.error}`
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        outcome.errors.push(
          `Immediate ${group.alertType} to ${recipient.email} threw: ${msg}`
        );
      }
    }

    // --- daily_digest: exactly one email covering every enabled band ---
    if (plan.dailyDigest.length > 0) {
      const sections = plan.dailyDigest.map((group) => ({
        alertType: group.alertType,
        urgencyLevel: group.urgencyLevel,
        schedules: group.items.map((i) => toScheduleTableRow(i.schedule, i.daysUntilDue)),
      }));

      try {
        const res = await sendVGPDailyDigest({
          organizationName: orgName,
          recipient,
          sections,
          totalCount: countItems(plan.dailyDigest),
        });
        if (res.success) {
          outcome.emailsSent++;
          anyoneReceivedSomething = true;
        } else {
          outcome.errors.push(`Daily digest to ${recipient.email} failed: ${res.error}`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        outcome.errors.push(`Daily digest to ${recipient.email} threw: ${msg}`);
      }
    }

    // --- weekly_digest: defer to Monday rather than sending now ---
    if (plan.weeklyPending.length > 0 && prefRow) {
      const rows = plan.weeklyPending.flatMap((group) =>
        group.items.map((i) => ({
          user_id: prefRow.user_id,
          organization_id: orgId,
          schedule_id: i.schedule.id,
          asset_id: i.schedule.asset_id,
          alert_type: group.alertType,
          urgency_level: group.urgencyLevel,
          due_date: i.schedule.next_due_date,
          days_until_due: i.daysUntilDue,
        }))
      );

      // ignoreDuplicates so a schedule sitting in the same band all week is
      // queued once, not once per day. The UNIQUE (user_id, schedule_id,
      // alert_type) constraint is what makes that hold.
      const { error: queueError } = await supabase
        .from("pending_weekly_digests")
        .upsert(rows, {
          onConflict: "user_id,schedule_id,alert_type",
          ignoreDuplicates: true,
        });

      if (queueError) {
        console.log(
          `${LOG_PREFIX} Failed to queue weekly digest for ${recipient.email}: ${queueError.message}`
        );
        Sentry.captureException(queueError, {
          tags: { area: "vgp_cron", step: "weekly_queue" },
          extra: { orgId, userId: prefRow.user_id, rowCount: rows.length },
        });
        outcome.errors.push(`Weekly queue for ${recipient.email} failed: ${queueError.message}`);
      } else {
        outcome.weeklyQueued += rows.length;
        // Queued counts as handled: the alert is not lost, just deferred.
        anyoneReceivedSomething = true;
      }
    }
  }

  // If the whole org's claim reached nobody -- every send failed -- hand the
  // claim back so tomorrow's run can retry. A claim with no delivery behind it
  // would otherwise suppress these alerts for a full day.
  //
  // Deliberately NOT released when recipients simply chose 'off' or filtered
  // the bands out: that is a delivered decision, not a failure, and re-offering
  // those schedules tomorrow would just repeat the same no-op.
  if (!anyoneReceivedSomething && outcome.errors.length > 0 && params.allClaimedRowIds.length > 0) {
    const { error: releaseError } = await supabase
      .from("vgp_alerts")
      .delete()
      .in("id", params.allClaimedRowIds);

    if (releaseError) {
      console.log(`${LOG_PREFIX} Failed to release claim for ${orgName}: ${releaseError.message}`);
      Sentry.captureException(releaseError, {
        tags: { area: "vgp_cron", step: "alert_claim_release" },
        extra: { orgId, rowCount: params.allClaimedRowIds.length },
      });
    } else {
      console.log(
        `${LOG_PREFIX} ${orgName}: every delivery failed, released ` +
        `${params.allClaimedRowIds.length} claim(s) for retry`
      );
    }
  }

  return outcome;
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
  /** Schedules dropped because their asset is seeded demo data. */
  demo_schedules_skipped: number;
  /** Recipient addresses dropped as undeliverable (RFC 2606 .test, blanks). */
  recipients_filtered: number;
  /** Alert rows deferred to the Monday weekly digest run. */
  weekly_queued: number;
  /** Recipients who have set vgp_frequency = 'off'. */
  recipients_off: number;
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
    demo_schedules_skipped: 0,
    recipients_filtered: 0,
    weekly_queued: 0,
    recipients_off: 0,
    errors: [],
    details: [],
  };

  try {
    // 1. Get all active schedules due within 60 days or overdue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixtyDaysOut = new Date(today);
    sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60);

    // `assets!inner` is load-bearing. On a plain embed PostgREST applies a
    // nested filter to the EMBEDDED row only -- the parent schedule still comes
    // back, just with `assets: null` -- so `.eq("assets.is_demo_data", false)`
    // would not remove a single demo schedule. !inner turns it into an inner
    // join, which is what makes the filter drop the parent row.
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
        assets!inner (
          name,
          serial_number,
          category_id,
          current_location,
          is_demo_data,
          asset_categories (
            name
          )
        )
      `)
      .eq("status", "active")
      .eq("assets.is_demo_data", false)
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

    // Safety net behind the query filter above.
    //
    // These are not redundant. `.eq("assets.is_demo_data", false)` is a SQL
    // equality, and SQL equality never matches NULL -- assets.is_demo_data is
    // `boolean DEFAULT false` with no NOT NULL, so any row written before that
    // column existed is NULL and the query silently drops it. Those are real
    // customer assets. This pass re-includes them by testing identity against
    // `true` instead, so the only rows removed here are ones positively marked
    // as demo.
    //
    // It also keeps the exclusion true if the embed shape is ever edited: the
    // filter lives in one tested predicate rather than in a query string.
    const eligibleSchedules = schedules.filter((s) => !isDemoSchedule(s));
    const demoSchedulesSkipped = schedules.length - eligibleSchedules.length;

    if (demoSchedulesSkipped > 0) {
      console.log(
        `${LOG_PREFIX} Skipped ${demoSchedulesSkipped} demo schedule(s) ` +
        `(is_demo_data = true). Demo assets never generate recurring alerts.`
      );
    }
    result.demo_schedules_skipped = demoSchedulesSkipped;

    if (eligibleSchedules.length === 0) {
      console.log(`${LOG_PREFIX} No non-demo schedules due within 60 days. Done.`);
      return result;
    }

    console.log(`${LOG_PREFIX} Found ${eligibleSchedules.length} active schedules within 60-day window`);

    // 2. Get last unresolved alert for each schedule (for cooldown checking)
    const scheduleIds = eligibleSchedules.map((s) => s.id);
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
    for (const schedule of eligibleSchedules) {
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
      const { recipients, filtered } = await getAlertRecipients(orgId, prefs.recipients);
      result.recipients_filtered += filtered;
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

        // NOTE: threshold filtering no longer happens here.
        //
        // It used to be an org-wide decision applied before the cooldown, which
        // made it impossible for two members of the same org to want different
        // bands. It now runs per recipient in planDelivery(), so a schedule is
        // collected here if ANY recipient might want it and filtered per person
        // below. Overdue is no longer unconditional either -- it is threshold 0,
        // which a user may switch off like any other band.

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

      // Per-user preferences for this org, loaded once rather than per band.
      const userPrefs = await getUserPreferencesByEmail(orgId);

      // Bands that survived the claim, ready to be routed per recipient.
      const claimedGroups: PendingAlertGroup<{
        schedule: ScheduleWithAsset;
        rule: FrequencyRule;
        daysUntilDue: number;
      }>[] = [];

      // Every vgp_alerts row id this org claimed this run. Kept so a delivery
      // that reaches nobody at all can hand the claim back.
      const allClaimedRowIds: string[] = [];

      for (const [level, items] of byUrgency) {
        const alertType = items[0].rule.alertType;

        try {
          const now = new Date().toISOString();
          const todayStr = now.split("T")[0];
          const recipientEmails = recipients.map(r => r.email);

          // CLAIM BEFORE SEND.
          //
          // These rows are the dedup record, so writing them after the email
          // meant a failed write left the send unrecorded -- and the same alert
          // went out again on the next run. The old code caught that case and
          // logged it, which is all it could do: the mail was already gone.
          //
          // Inverting the order makes the database the arbiter. Paired with the
          // unique index from 20260902140000, an insert that collides with an
          // existing (schedule_id, alert_type, alert_date) row is dropped by
          // ignoreDuplicates rather than raising, and the returned rows tell us
          // exactly which schedules THIS run is responsible for emailing. A
          // concurrent run -- the 07:00 cron overlapping a manual admin trigger
          // -- claims the remainder or nothing at all, and cannot re-send what
          // this one already holds.
          //
          // Claimed through an RPC, not supabase-js .upsert().
          //
          // idx_vgp_alerts_dedup_unique is a PARTIAL index (WHERE sent = true),
          // and Postgres only accepts a partial index as the ON CONFLICT
          // arbiter when the statement repeats its predicate. PostgREST's
          // on_conflict parameter takes a bare column list with no way to
          // express one, so the client call could only ever emit the form
          // Postgres rejects:
          //
          //   42P10  there is no unique or exclusion constraint matching the
          //          ON CONFLICT specification
          //
          // That failed on every claim, and because the handler continues past
          // a claim error the run completed while sending nothing. The fix is
          // not expressible in the client; the statement has to live in SQL.
          // See supabase/migrations/20260904100000_claim_vgp_alerts_rpc.sql.
          // Cast rather than .returns<T>(): types/database.ts is generated and
          // does not yet know this function, so the generic would resolve
          // against an absent signature.
          const { data: claimedRows, error: claimError } = (await supabase
            .rpc("claim_vgp_alerts", {
              p_rows: items.map((item) => ({
                schedule_id: item.schedule.id,
                asset_id: item.schedule.asset_id,
                organization_id: orgId,
                alert_type: alertType,
                urgency_level: item.rule.level,
                alert_date: todayStr,
                due_date: item.schedule.next_due_date,
                sent_at: now,
                email_sent_to: recipientEmails,
              })),
            })) as unknown as {
              data: ClaimedAlertRow[] | null;
              error: { message: string } | null;
            };

          if (claimError) {
            // Nothing was claimed, so nothing is sent. This is the safe
            // direction to fail: the alert is retried on the next run rather
            // than delivered twice.
            console.log(`${LOG_PREFIX} Failed to claim alerts: ${claimError.message}`);
            Sentry.captureException(claimError, {
              tags: { area: "vgp_cron", step: "alert_dedup_claim" },
              extra: { orgId, alertType, batchSize: items.length },
            });
            result.errors.push(`Claim failed ${alertType} for ${orgName}: ${claimError.message}`);
            orgDetail.skipped += items.length;
            continue;
          }

          // out_* names: every RETURNS TABLE column is an in-scope PL/pgSQL
          // variable, so plain `schedule_id`/`sent` would be ambiguous against
          // the table columns inside the function.
          const claimedIds = new Set((claimedRows || []).map((r) => r.out_schedule_id));
          allClaimedRowIds.push(...(claimedRows || []).map((r) => r.out_id));

          if (claimedIds.size === 0) {
            // Every schedule in this batch was already claimed -- another run
            // holds them. Sending now would duplicate that run's email.
            console.log(
              `${LOG_PREFIX} ${orgName}: ${level} (${alertType}) already claimed elsewhere, skipping send`
            );
            orgDetail.cooldown += items.length;
            continue;
          }

          // Route exactly what was claimed, so a partially-claimed batch does
          // not re-list schedules another run is already reporting.
          const claimedItems = items.filter((i) => claimedIds.has(i.schedule.id));

          if (claimedItems.length < items.length) {
            console.log(
              `${LOG_PREFIX} ${orgName}: claimed ${claimedItems.length}/${items.length} ` +
              `${alertType} schedules, remainder held by a concurrent run`
            );
          }

          claimedGroups.push({
            preferenceDay: items[0].rule.preferenceDay,
            alertType,
            urgencyLevel: level,
            items: claimedItems,
          });
        } catch (claimException: unknown) {
          const msg = claimException instanceof Error ? claimException.message : String(claimException);
          console.log(
            `${LOG_PREFIX} Exception claiming ${level} alerts for ${orgName}: ${msg}`
          );
          result.errors.push(`Exception ${alertType} for ${orgName}: ${msg}`);
          orgDetail.skipped += items.length;
        }
      }

      // --------------------------------------------------------------
      // Per-recipient delivery
      //
      // The claim above is org-wide: one row per (schedule, alert_type, date),
      // which is what the unique index arbitrates. Delivery is per person,
      // because two members of the same org can now want different bands at
      // different cadences.
      //
      // Consequence worth stating plainly: the claim is taken once for the org,
      // so if every recipient turns out to want nothing, the schedules stay
      // claimed for today and are not re-offered until tomorrow. That is the
      // correct outcome -- nobody wanted them -- but it does mean a claim is
      // not evidence that mail was sent.
      // --------------------------------------------------------------
      if (claimedGroups.length > 0) {
        const deliveries = await deliverToRecipients({
          orgId,
          orgName,
          recipients,
          userPrefs,
          orgDefaults: { timing: prefs.timing, enabled: prefs.enabled },
          groups: claimedGroups,
          allClaimedRowIds,
        });

        orgDetail.sent += deliveries.emailsSent;
        result.emails_sent += deliveries.emailsSent;
        result.weekly_queued += deliveries.weeklyQueued;
        result.recipients_off += deliveries.recipientsOff;
        result.errors.push(...deliveries.errors);
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
  /** Recall notices delivered to the renting clients themselves. */
  client_emails_sent: number;
  recall_items_found: number;
  errors: string[];
}

/**
 * Email each client holding equipment with an approaching VGP deadline.
 *
 * Groups a batch by client so a client with three machines gets one email
 * listing all three, not three separate emails. Clients with no email on file
 * are skipped and logged - the internal alert still covers those.
 */
interface RecallRentalRow {
  client_name: string;
  client_contact: string | null;
  clients: { name: string | null; email: string | null } | null;
  assets: { name: string | null; serial_number: string | null } | null;
}

async function notifyClientsOfRecall(
  orgName: string,
  batch: { rental: RecallRentalRow; nextDueDate: string; daysUntilDue: number }[]
): Promise<number> {
  const RECALL_PREFIX = "[RECALL-CLIENT]";
  const { sendClientRecallNotice } = await import("@/lib/email/email-service");

  interface NoticeItem {
    assetName: string;
    serialNumber: string;
    vgpDueDate: string;
    daysUntilDue: number;
  }

  // Group items by recipient email.
  const byEmail = new Map<string, { clientName: string; items: NoticeItem[] }>();

  for (const item of batch) {
    const linked = item.rental.clients;
    const contact = item.rental.client_contact;
    const email: string | null =
      linked?.email || (contact && contact.includes("@") ? contact.trim() : null);

    if (!email) continue;

    const [y, m, d] = item.nextDueDate.split("-");
    const entry: { clientName: string; items: NoticeItem[] } = byEmail.get(email) || {
      clientName: linked?.name || item.rental.client_name,
      items: [],
    };
    entry.items.push({
      assetName: item.rental.assets?.name || "Équipement",
      serialNumber: item.rental.assets?.serial_number || "-",
      vgpDueDate: `${d}/${m}/${y}`,
      daysUntilDue: item.daysUntilDue,
    });
    byEmail.set(email, entry);
  }

  const skipped = batch.length - [...byEmail.values()].reduce((n, e) => n + e.items.length, 0);
  if (skipped > 0) {
    console.log(`${RECALL_PREFIX} ${skipped} item(s) skipped - no client email on file`);
  }

  let sentCount = 0;
  for (const [email, entry] of byEmail) {
    try {
      const res = await sendClientRecallNotice({
        organizationName: orgName,
        clientName: entry.clientName,
        clientEmail: email,
        items: entry.items,
      });
      if (res.success) {
        sentCount++;
      } else {
        console.log(`${RECALL_PREFIX} Failed for ${email}: ${res.error}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${RECALL_PREFIX} Exception for ${email}: ${msg}`);
    }
  }

  return sentCount;
}

async function runClientRecallPass(): Promise<RecallResult> {
  const RECALL_PREFIX = "[RECALL]";
  console.log(`${RECALL_PREFIX} Starting client recall pass...`);

  const result: RecallResult = {
    organizations_processed: 0,
    recall_emails_sent: 0,
    client_emails_sent: 0,
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
        client_contact,
        checkout_date,
        expected_return_date,
        clients (
          name,
          email
        ),
        assets (
          name,
          serial_number,
          category_id,
          is_demo_data,
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

    // Demo assets are excluded here for the same reason as the digest pass, but
    // the stakes are higher: this pass emails the CLIENT holding the equipment,
    // not internal staff. A recall notice naming a seeded demo machine is sent
    // to a real customer of the org, which is worse than noise.
    const eligibleRentals = rentalSchedules.filter(
      (r: { assets?: { is_demo_data?: boolean | null } | null }) => !isDemoSchedule(r)
    );
    const demoRentalsSkipped = rentalSchedules.length - eligibleRentals.length;

    if (demoRentalsSkipped > 0) {
      console.log(
        `${RECALL_PREFIX} Skipped ${demoRentalsSkipped} rental(s) on demo assets`
      );
    }

    if (eligibleRentals.length === 0) {
      console.log(`${RECALL_PREFIX} No active rentals on real assets. Done.`);
      return result;
    }

    console.log(`${RECALL_PREFIX} Found ${eligibleRentals.length} active rentals`);

    // For each rental, check if its asset has a VGP schedule due within 30 days
    const assetIds = eligibleRentals.map((r: any) => r.asset_id);

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

    for (const rental of eligibleRentals) {
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

      const { recipients } = await getAlertRecipients(orgId, prefs.recipients);
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
          assetName: item.rental.assets?.name || "Équipement inconnu",
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

            // Dedup records, written as ONE insert rather than one per item.
            // A 400-item batch used to be 400 sequential round trips.
            const now = new Date().toISOString();
            const recipientEmails = recipients.map((r) => r.email);

            const { error: dedupError } = await supabase
              .from("client_recall_alerts")
              .insert(
                batch.map((item) => ({
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
                }))
              );

            if (dedupError) {
              // Not fatal, but it means the cooldown will not hold and this
              // batch can be emailed again tomorrow. Worth knowing about.
              console.log(
                `${RECALL_PREFIX} Dedup insert failed for ${orgName}: ${dedupError.message}`
              );
              Sentry.captureException(dedupError, {
                tags: { area: "vgp_cron", step: "recall_dedup_insert" },
                extra: { orgId, alertType, batchSize: batch.length },
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
            Sentry.captureMessage(
              `Client recall staff digest failed: ${sendResult.error}`,
              { level: "error", tags: { area: "vgp_cron", step: "recall_staff_email" } }
            );
          }

          // Notify the clients themselves.
          //
          // This used to sit inside the success branch above, so a failure of
          // the INTERNAL staff digest silently suppressed the notice to the
          // people actually holding the equipment. Those are two different
          // audiences and two different purposes: the staff email says what to
          // plan, this one is what gets the machine back before its VGP
          // deadline. One failing must not cancel the other.
          try {
            const sent = await notifyClientsOfRecall(orgName, batch);
            result.client_emails_sent += sent;
          } catch (clientErr: any) {
            console.log(
              `${RECALL_PREFIX} Client notice failed for ${orgName}: ${clientErr.message}`
            );
            result.errors.push(
              `Client notice failed for ${orgName}: ${clientErr.message}`
            );
            Sentry.captureException(clientErr, {
              tags: { area: "vgp_cron", step: "recall_client_notice" },
              extra: { orgId, alertType },
            });
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
