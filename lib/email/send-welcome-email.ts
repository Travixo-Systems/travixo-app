// lib/email/send-welcome-email.ts
// Sends the welcome onboarding email with demo Excel attachment via Resend.

import { Resend } from 'resend';
import { render } from '@react-email/render';
import * as fs from 'fs';
import * as path from 'path';

import { WelcomeOnboardingEmail } from './templates/welcome-onboarding';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.loxam.fr';

const SENDER_EMAIL = 'noreply@loxam.fr';
const SENDER_NAME = 'LOXAM';
const REPLY_TO = 'contact@loxam.fr';

function getResendClient(): Resend {
  if (!RESEND_API_KEY) {
    throw new Error('[WELCOME-EMAIL] RESEND_API_KEY is not configured');
  }
  return new Resend(RESEND_API_KEY);
}

interface SendWelcomeEmailParams {
  email: string;
  fullName: string;
  companyName: string;
}

export async function sendWelcomeEmail(
  params: SendWelcomeEmailParams
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  const logPrefix = '[WELCOME-EMAIL]';

  try {
    const resend = getResendClient();

    // Read the demo Excel file
    const excelPath = path.join(process.cwd(), 'public', 'files', 'demo-import-equipements.xlsx');
    let excelBuffer: Buffer;

    try {
      excelBuffer = fs.readFileSync(excelPath);
    } catch (fileError) {
      console.error(`${logPrefix} Could not read demo Excel file at ${excelPath}:`, fileError);
      // Send email without attachment rather than failing entirely
      excelBuffer = null as any;
    }

    // Render the React Email template
    const template = WelcomeOnboardingEmail({
      fullName: params.fullName,
      companyName: params.companyName,
      appUrl: APP_URL,
    });

    const html = await render(template);

    // Build attachments array
    const attachments = excelBuffer
      ? [{ filename: 'demo-import-equipements.xlsx', content: excelBuffer }]
      : [];

    // Send via Resend
    const { data, error } = await resend.emails.send({
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      to: params.email,
      replyTo: REPLY_TO,
      subject: `Bienvenue sur LOXAM — Votre compte est pret`,
      html,
      attachments,
    });

    if (error) {
      console.error(`${logPrefix} Resend API error:`, error.message);
      return { success: false, error: error.message };
    }

    console.log(`${logPrefix} Welcome email sent to ${params.email}: ${data?.id}`);
    return { success: true, emailId: data?.id };
  } catch (error: any) {
    console.error(`${logPrefix} Error sending welcome email:`, error.message);
    return { success: false, error: error.message };
  }
}
