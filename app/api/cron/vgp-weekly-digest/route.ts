// app/api/cron/vgp-weekly-digest/route.ts
//
// Drains pending_weekly_digests into one email per user, on Mondays.
//
// Registered on a DAILY schedule in vercel.json and gated to Monday inside the
// handler. Vercel's Hobby plan allows only daily cron expressions, so
// "0 7 * * 1" is not available; the cost is six no-op invocations a week, each
// of which returns before touching the database. Moving to Pro is the only
// thing needed to switch this to a real Monday-only schedule -- see MONDAY_UTC
// below.

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/node";

import type { EmailRecipient, ScheduleTableRow } from "@/types/vgp-alerts";
import type { DigestSection } from "@/lib/email/templates/vgp-digest";

/** Same ceiling as the daily cron: a slow org must not consume the run. */
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LOG_PREFIX = "[VGP-WEEKLY]";

/** Date.getUTCDay(): 0 = Sunday, 1 = Monday. */
const MONDAY_UTC = 1;

/** Most urgent first, matching the digest template's own ordering. */
const URGENCY_ORDER: Record<string, number> = {
  overdue: 0,
  critical: 1,
  urgent: 2,
  attention: 3,
  planning: 4,
};

interface PendingRow {
  id: string;
  user_id: string;
  organization_id: string;
  schedule_id: string;
  asset_id: string | null;
  alert_type: string;
  urgency_level: string | null;
  due_date: string;
  days_until_due: number;
  users: { email: string; full_name: string | null } | null;
  organizations: { name: string } | null;
  assets: {
    name: string | null;
    serial_number: string | null;
    current_location: string | null;
    asset_categories: { name: string } | null;
  } | null;
}

export interface WeeklyDigestResult {
  success: boolean;
  timestamp: string;
  skipped_not_monday: boolean;
  users_processed: number;
  emails_sent: number;
  rows_cleared: number;
  errors: string[];
}

function formatDateFR(isoDate: string): string {
  try {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return isoDate;
  }
}

function toScheduleTableRow(row: PendingRow): ScheduleTableRow {
  return {
    assetName: row.assets?.name || "Équipement inconnu",
    serialNumber: row.assets?.serial_number || "-",
    category: row.assets?.asset_categories?.name || "-",
    location: row.assets?.current_location || "-",
    dueDate: formatDateFR(row.due_date),
    daysRemaining: row.days_until_due,
  };
}

export async function runWeeklyDigest(force = false): Promise<WeeklyDigestResult> {
  const result: WeeklyDigestResult = {
    success: true,
    timestamp: new Date().toISOString(),
    skipped_not_monday: false,
    users_processed: 0,
    emails_sent: 0,
    rows_cleared: 0,
    errors: [],
  };

  // Monday gate. Returns before any query so the six non-Monday runs cost
  // nothing beyond the invocation itself.
  const day = new Date().getUTCDay();
  if (!force && day !== MONDAY_UTC) {
    result.skipped_not_monday = true;
    console.log(`${LOG_PREFIX} Not Monday (UTC day ${day}), nothing to do.`);
    return result;
  }

  try {
    const { data: pending, error: queryError } = await supabase
      .from("pending_weekly_digests")
      .select(`
        id,
        user_id,
        organization_id,
        schedule_id,
        asset_id,
        alert_type,
        urgency_level,
        due_date,
        days_until_due,
        users ( email, full_name ),
        organizations ( name ),
        assets (
          name,
          serial_number,
          current_location,
          asset_categories ( name )
        )
      `).returns<PendingRow[]>();

    if (queryError) {
      console.log(`${LOG_PREFIX} Query failed: ${queryError.message}`);
      Sentry.captureException(queryError, {
        tags: { area: "vgp_weekly", step: "load_pending" },
      });
      result.success = false;
      result.errors.push(`Query error: ${queryError.message}`);
      return result;
    }

    if (!pending || pending.length === 0) {
      console.log(`${LOG_PREFIX} Queue is empty. Done.`);
      return result;
    }

    console.log(`${LOG_PREFIX} ${pending.length} queued row(s) to process`);

    // Group by user: one email each, however many orgs or bands are involved.
    const byUser = new Map<string, PendingRow[]>();
    for (const row of pending) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
      byUser.get(row.user_id)!.push(row);
    }

    const { sendVGPWeeklyDigest } = await import("@/lib/email/email-service");

    for (const [userId, rows] of byUser) {
      result.users_processed++;

      const email = rows[0].users?.email;
      if (!email) {
        // The user was deleted between queueing and now. The FK cascade should
        // have removed these rows; clear them so the queue cannot wedge.
        console.log(`${LOG_PREFIX} No email for user ${userId}, clearing ${rows.length} row(s)`);
        await supabase
          .from("pending_weekly_digests")
          .delete()
          .in("id", rows.map((r) => r.id));
        result.rows_cleared += rows.length;
        continue;
      }

      const recipient: EmailRecipient = {
        email,
        full_name: rows[0].users?.full_name || "",
      };
      const orgName = rows[0].organizations?.name || "Votre organisation";

      // Group this user's rows into digest sections by urgency band.
      const byUrgency = new Map<string, PendingRow[]>();
      for (const row of rows) {
        const key = `${row.urgency_level || "planning"}|${row.alert_type}`;
        if (!byUrgency.has(key)) byUrgency.set(key, []);
        byUrgency.get(key)!.push(row);
      }

      const sections: DigestSection[] = [...byUrgency.entries()]
        .map(([key, group]) => {
          const [urgencyLevel, alertType] = key.split("|");
          return {
            alertType,
            urgencyLevel,
            schedules: group.map(toScheduleTableRow),
          };
        })
        .sort(
          (a, b) =>
            (URGENCY_ORDER[a.urgencyLevel] ?? 99) - (URGENCY_ORDER[b.urgencyLevel] ?? 99)
        );

      try {
        const sendResult = await sendVGPWeeklyDigest({
          organizationName: orgName,
          recipient,
          sections,
          totalCount: rows.length,
        });

        if (!sendResult.success) {
          // Rows are LEFT IN PLACE. They will be retried next Monday rather
          // than silently discarded -- for VGP the queued item is a compliance
          // warning, so losing it is worse than delaying it.
          console.log(`${LOG_PREFIX} Send failed for ${email}: ${sendResult.error}`);
          result.errors.push(`Weekly digest to ${email} failed: ${sendResult.error}`);
          continue;
        }

        result.emails_sent++;

        // Clear only after the send is acknowledged.
        const { error: clearError } = await supabase
          .from("pending_weekly_digests")
          .delete()
          .in("id", rows.map((r) => r.id));

        if (clearError) {
          // The mail went out but the queue still holds these rows, so next
          // Monday would repeat them. Worth an alert; not worth un-sending.
          console.log(`${LOG_PREFIX} Failed to clear queue for ${email}: ${clearError.message}`);
          Sentry.captureException(clearError, {
            tags: { area: "vgp_weekly", step: "clear_queue" },
            extra: { userId, rowCount: rows.length },
          });
          result.errors.push(`Queue clear for ${email} failed: ${clearError.message}`);
        } else {
          result.rows_cleared += rows.length;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`${LOG_PREFIX} Exception for ${email}: ${msg}`);
        result.errors.push(`Exception for ${email}: ${msg}`);
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`${LOG_PREFIX} Unexpected error: ${msg}`);
    Sentry.captureException(error, { tags: { area: "vgp_weekly", step: "run" } });
    result.success = false;
    result.errors.push(`Unexpected error: ${msg}`);
  }

  console.log(`${LOG_PREFIX} Run complete:`, JSON.stringify(result, null, 2));
  return result;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log(`${LOG_PREFIX} Unauthorized request - invalid CRON_SECRET`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWeeklyDigest();
    return NextResponse.json(result, { status: result.success ? 200 : 207 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`${LOG_PREFIX} Unexpected error:`, msg);
    return NextResponse.json(
      { success: false, error: msg, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
