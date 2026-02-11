// =============================================================================
// VGP Email Alert Service
// Wrapper around Resend SDK for sending VGP compliance alert emails
//
// CORRECTED: render import from @react-email/render (separate package)
// CORRECTED: Uses createClient from @supabase/supabase-js for service role
//            (NOT @/lib/supabase/server which is session-based)
// =============================================================================

import { Resend } from 'resend';
import { render } from '@react-email/render';
import { createClient } from '@supabase/supabase-js';

import { VGPReminder30Day } from './templates/vgp-reminder-30day';
import { VGPReminder15Day } from './templates/vgp-reminder-15day';
import { VGPReminder7Day } from './templates/vgp-reminder-7day';
import { VGPReminder1Day } from './templates/vgp-reminder-1day';
import { VGPOverdue } from './templates/vgp-overdue';
import { ClientRecall30Day } from './templates/client-recall-30day';
import { ClientRecall14Day } from './templates/client-recall-14day';

import type {
  VGPAlertType,
  ScheduleTableRow,
  EmailRecipient,
  VGPAlertEmailProps,
} from '@/types/vgp-alerts';

import type { RecallTableRow } from './templates/components/rental-recall-table';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.travixosystems.com';

const SENDER_EMAIL = 'noreply@travixosystems.com';
const SENDER_NAME = 'TraviXO Systems';
const REPLY_TO = 'contact@travixosystems.com';

// Resend free tier: 100 emails/day, 3,000/month
const MAX_DAILY_EMAILS = 90; // Leave buffer below 100 limit

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function getResendClient(): Resend {
  if (!RESEND_API_KEY) {
    throw new Error('[EMAIL] RESEND_API_KEY is not configured');
  }
  return new Resend(RESEND_API_KEY);
}

/**
 * Admin Supabase client using SERVICE_ROLE_KEY.
 * This bypasses RLS entirely - used ONLY for server-side cron/background jobs.
 * DO NOT use this in user-facing API routes.
 */
function getAdminSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Subject Lines (bilingual)
// ---------------------------------------------------------------------------

const SUBJECT_LINES: Record<VGPAlertType, (count: number, orgName: string) => string> = {
  reminder_30day: (count, orgName) =>
    `[TraviXO] ${count} inspection${count > 1 ? 's' : ''} VGP a planifier - ${orgName}`,
  reminder_15day: (count, orgName) =>
    `[TraviXO] ${count} inspection${count > 1 ? 's' : ''} VGP dans 15 jours - ${orgName}`,
  reminder_7day: (count, orgName) =>
    `[TraviXO] URGENT : ${count} inspection${count > 1 ? 's' : ''} VGP dans 7 jours - ${orgName}`,
  reminder_1day: (count, orgName) =>
    `[TraviXO] CRITIQUE : ${count} inspection${count > 1 ? 's' : ''} VGP due${count > 1 ? 's' : ''} demain - ${orgName}`,
  overdue: (count, orgName) =>
    `[TraviXO] EN RETARD : ${count} inspection${count > 1 ? 's' : ''} VGP - Risque d'amende - ${orgName}`,
};

// ---------------------------------------------------------------------------
// Template Rendering
// ---------------------------------------------------------------------------

function getEmailTemplate(
  alertType: VGPAlertType,
  props: VGPAlertEmailProps
): React.ReactElement {
  switch (alertType) {
    case 'reminder_30day':
      return VGPReminder30Day(props);
    case 'reminder_15day':
      return VGPReminder15Day(props);
    case 'reminder_7day':
      return VGPReminder7Day(props);
    case 'reminder_1day':
      return VGPReminder1Day(props);
    case 'overdue':
      return VGPOverdue(props);
    default:
      throw new Error(`[EMAIL] Unknown alert type: ${alertType}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a VGP alert email to all recipients for an organization.
 *
 * @param alertType - The type of alert (30day, 7day, 1day, overdue)
 * @param organizationName - The organization name for the email
 * @param recipients - Array of email recipients
 * @param schedules - Array of schedule data for the email table
 * @returns Object with success status and email ID or error
 */
export async function sendVGPAlert(
  alertType: VGPAlertType,
  organizationName: string,
  recipients: EmailRecipient[],
  schedules: ScheduleTableRow[]
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const logPrefix = '[EMAIL]';

  if (recipients.length === 0) {
    console.log(`${logPrefix} No recipients for ${alertType} alert to ${organizationName}, skipping`);
    return { success: false, error: 'No recipients' };
  }

  if (schedules.length === 0) {
    console.log(`${logPrefix} No schedules for ${alertType} alert to ${organizationName}, skipping`);
    return { success: false, error: 'No schedules' };
  }

  const resend = getResendClient();

  const emailProps: VGPAlertEmailProps = {
    organizationName,
    schedules,
    alertType,
    appUrl: APP_URL,
  };

  const subject = SUBJECT_LINES[alertType](schedules.length, organizationName);
  const recipientEmails = recipients.map((r) => r.email);

  console.log(
    `${logPrefix} Sending ${alertType} alert to ${organizationName} ` +
    `(${schedules.length} schedules, ${recipientEmails.length} recipients)`
  );

  // Render the React Email template to HTML
  let html: string;
  try {
    const template = getEmailTemplate(alertType, emailProps);
    // render() from @react-email/render returns a Promise<string>
    html = await render(template);
  } catch (renderError) {
    const msg = renderError instanceof Error ? renderError.message : String(renderError);
    console.log(`${logPrefix} Template render error: ${msg}`);
    return { success: false, error: `Template render failed: ${msg}` };
  }

  // Attempt to send with 1 retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data, error } = await resend.emails.send({
        from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
        to: recipientEmails,
        replyTo: REPLY_TO,
        subject,
        html,
      });

      if (error) {
        console.log(
          `${logPrefix} Resend API error (attempt ${attempt}): ${error.message}`
        );
        if (attempt === 2) {
          return { success: false, error: `Resend error: ${error.message}` };
        }
        // Wait 2 seconds before retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      console.log(
        `${logPrefix} Email sent successfully: ${data?.id} (attempt ${attempt})`
      );
      return { success: true, emailId: data?.id };

    } catch (sendError) {
      const msg = sendError instanceof Error ? sendError.message : String(sendError);
      console.log(`${logPrefix} Send exception (attempt ${attempt}): ${msg}`);
      if (attempt === 2) {
        return { success: false, error: `Send exception: ${msg}` };
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return { success: false, error: 'All send attempts failed' };
}

/**
 * Log a sent email alert in the vgp_alerts table.
 *
 * Records one row per schedule in the alert batch so we can track
 * which specific schedules have been notified and prevent duplicates.
 */
export async function logEmailAlerts(
  scheduleIds: string[],
  assetIds: string[],
  organizationId: string,
  alertType: VGPAlertType,
  dueDates: string[],
  recipients: string[]
): Promise<void> {
  const logPrefix = '[EMAIL]';
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  const rows = scheduleIds.map((scheduleId, i) => ({
    schedule_id: scheduleId,
    asset_id: assetIds[i] || null,
    organization_id: organizationId,
    alert_type: alertType,
    alert_date: today,
    due_date: dueDates[i] || today,
    sent: true,
    sent_at: now,
    email_sent_to: recipients,
  }));

  const { error } = await supabase.from('vgp_alerts').insert(rows);

  if (error) {
    console.log(
      `${logPrefix} Failed to log alerts in vgp_alerts table: ${error.message}`
    );
  } else {
    console.log(
      `${logPrefix} Logged ${rows.length} alert records for ${alertType} (org: ${organizationId})`
    );
  }
}

/**
 * Check how many emails have been sent today to stay within rate limits.
 */
export async function getDailyEmailCount(): Promise<number> {
  const supabase = getAdminSupabase();
  const today = new Date().toISOString().split('T')[0];

  const { count, error } = await supabase
    .from('vgp_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('sent', true)
    .eq('alert_date', today);

  if (error) {
    console.log(`[EMAIL] Error checking daily email count: ${error.message}`);
    return 0;
  }

  return count || 0;
}

/**
 * Check if a specific alert has already been sent for a schedule today.
 * Returns the schedule_ids that have NOT been alerted yet.
 */
export async function filterAlreadySentAlerts(
  scheduleIds: string[],
  alertType: VGPAlertType
): Promise<string[]> {
  const supabase = getAdminSupabase();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('vgp_alerts')
    .select('schedule_id')
    .in('schedule_id', scheduleIds)
    .eq('alert_type', alertType)
    .eq('alert_date', today)
    .eq('sent', true);

  if (error) {
    console.log(
      `[EMAIL] Error checking existing alerts: ${error.message}`
    );
    // If we cannot check, proceed with all to avoid missing alerts
    return scheduleIds;
  }

  const alreadySent = new Set((data || []).map((row) => row.schedule_id));

  return scheduleIds.filter((id) => !alreadySent.has(id));
}

/**
 * Fetch email recipients for an organization, filtered by the recipients preference.
 *
 * @param recipientsPref - 'owner' (owner only), 'admin' (owner+admin), or 'all' (owner+admin+manager)
 */
export async function getAlertRecipients(
  organizationId: string,
  recipientsPref: string = 'owner'
): Promise<EmailRecipient[]> {
  const supabase = getAdminSupabase();

  // Map preference to role filter
  let roles: string[];
  switch (recipientsPref) {
    case 'all':
      roles = ['owner', 'admin', 'manager'];
      break;
    case 'admin':
      roles = ['owner', 'admin'];
      break;
    case 'owner':
    default:
      roles = ['owner'];
      break;
  }

  const { data, error } = await supabase
    .from('users')
    .select('email, full_name')
    .eq('organization_id', organizationId)
    .in('role', roles);

  if (error) {
    console.log(
      `[EMAIL] Error fetching recipients for org ${organizationId}: ${error.message}`
    );
    return [];
  }

  return (data || []).map((user: any) => ({
    email: user.email,
    full_name: user.full_name || '',
  }));
}

/**
 * Get notification preferences for an organization.
 * Reads from the `notification_preferences` JSONB column (set by Settings UI).
 */
export async function getOrgNotificationPrefs(
  organizationId: string
): Promise<{ enabled: boolean; alertDays: number[]; recipients: string }> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from('organizations')
    .select('notification_preferences')
    .eq('id', organizationId)
    .single() as { data: { notification_preferences: any } | null; error: any };

  if (error || !data) {
    console.log(
      `[EMAIL] Error fetching org prefs for ${organizationId}: ${error?.message}`
    );
    // Default: enabled with all alert types, owner-only recipients
    return { enabled: true, alertDays: [30, 7, 1, 0], recipients: 'owner' };
  }

  const prefs = data.notification_preferences;

  // If no preferences stored yet, use defaults
  if (!prefs) {
    return { enabled: true, alertDays: [30, 7, 1, 0], recipients: 'owner' };
  }

  // email_enabled must be true AND vgp_alerts.enabled must be true
  const emailEnabled = prefs.email_enabled ?? true;
  const vgpEnabled = prefs.vgp_alerts?.enabled ?? true;

  return {
    enabled: emailEnabled && vgpEnabled,
    alertDays: Array.isArray(prefs.vgp_alerts?.timing) ? prefs.vgp_alerts.timing : [30, 7, 1, 0],
    recipients: prefs.vgp_alerts?.recipients || 'owner',
  };
}

// ---------------------------------------------------------------------------
// Client Recall Emails
// ---------------------------------------------------------------------------

export type RecallAlertType = 'recall_30day' | 'recall_14day';

const RECALL_SUBJECT_LINES: Record<RecallAlertType, (count: number, orgName: string) => string> = {
  recall_30day: (count, orgName) =>
    `[TraviXO] Rappel VGP : ${count} equipement${count > 1 ? 's' : ''} en location a planifier - ${orgName}`,
  recall_14day: (count, orgName) =>
    `[TraviXO] URGENT : ${count} equipement${count > 1 ? 's' : ''} en location - VGP dans 14 jours - ${orgName}`,
};

/**
 * Send a client recall email to org recipients.
 * Notifies that rented-out equipment needs VGP inspection soon.
 */
export async function sendClientRecallEmail(
  alertType: RecallAlertType,
  organizationName: string,
  recipients: EmailRecipient[],
  items: RecallTableRow[]
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const logPrefix = '[EMAIL-RECALL]';

  if (recipients.length === 0 || items.length === 0) {
    return { success: false, error: 'No recipients or items' };
  }

  const resend = getResendClient();

  const props = {
    organizationName,
    items,
    appUrl: APP_URL,
  };

  const subject = RECALL_SUBJECT_LINES[alertType](items.length, organizationName);
  const recipientEmails = recipients.map((r) => r.email);

  console.log(
    `${logPrefix} Sending ${alertType} to ${organizationName} ` +
    `(${items.length} items, ${recipientEmails.length} recipients)`
  );

  let html: string;
  try {
    const template = alertType === 'recall_30day'
      ? ClientRecall30Day(props)
      : ClientRecall14Day(props);
    html = await render(template);
  } catch (renderError) {
    const msg = renderError instanceof Error ? renderError.message : String(renderError);
    console.log(`${logPrefix} Template render error: ${msg}`);
    return { success: false, error: `Template render failed: ${msg}` };
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data, error } = await resend.emails.send({
        from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
        to: recipientEmails,
        replyTo: REPLY_TO,
        subject,
        html,
      });

      if (error) {
        console.log(`${logPrefix} Resend error (attempt ${attempt}): ${error.message}`);
        if (attempt === 2) return { success: false, error: `Resend error: ${error.message}` };
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      console.log(`${logPrefix} Email sent: ${data?.id} (attempt ${attempt})`);
      return { success: true, emailId: data?.id };
    } catch (sendError) {
      const msg = sendError instanceof Error ? sendError.message : String(sendError);
      console.log(`${logPrefix} Exception (attempt ${attempt}): ${msg}`);
      if (attempt === 2) return { success: false, error: `Send exception: ${msg}` };
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return { success: false, error: 'All send attempts failed' };
}

export type { RecallTableRow };