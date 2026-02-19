// =============================================================================
// Team Invitation Actions API - PATCH (resend/revoke)
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, createHash } from 'crypto';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { TeamInvitationEmail } from '@/lib/email/templates/team-invitation';
import { validateRequest, revokeInvitationSchema } from '@/lib/validations/schemas';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || 'https://app.loxam.fr';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// =============================================================================
// PATCH /api/team/invitations/[id] - Resend or revoke an invitation
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id, role, email')
      .eq('id', user.id)
      .single();

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    if (!['owner', 'admin'].includes(userData.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const validation = validateRequest(revokeInvitationSchema, body);
    if (!validation.success) return validation.error;

    const { action } = validation.data;

    // Get the invitation
    const { data: invitation, error: fetchError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('id', id)
      .eq('organization_id', userData.organization_id)
      .single();

    if (fetchError || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (action === 'revoke') {
      const { error: updateError } = await supabase
        .from('team_invitations')
        .update({ status: 'revoked' })
        .eq('id', id);

      if (updateError) {
        return NextResponse.json({ error: 'Failed to revoke invitation' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Invitation revoked' });
    }

    if (action === 'resend') {
      if (invitation.status !== 'pending' && invitation.status !== 'expired') {
        return NextResponse.json(
          { error: 'Can only resend pending or expired invitations' },
          { status: 400 }
        );
      }

      // Generate new token
      const plainToken = randomUUID();
      const hashedToken = hashToken(plainToken);
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error: updateError } = await supabase
        .from('team_invitations')
        .update({
          token: hashedToken,
          expires_at: newExpiry,
          status: 'pending',
        })
        .eq('id', id);

      if (updateError) {
        return NextResponse.json({ error: 'Failed to resend invitation' }, { status: 500 });
      }

      // Send email
      if (RESEND_API_KEY) {
        try {
          const resend = new Resend(RESEND_API_KEY);

          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', userData.organization_id)
            .single();

          const acceptUrl = `${APP_URL}/accept-invite/${plainToken}`;

          const emailHtml = await render(
            TeamInvitationEmail({
              organizationName: org?.name || 'Your organization',
              inviterEmail: userData.email,
              role: invitation.role,
              acceptUrl,
              appUrl: APP_URL,
            })
          );

          await resend.emails.send({
            from: 'LOXAM <noreply@loxam.fr>',
            replyTo: 'contact@loxam.fr',
            to: invitation.email,
            subject: `Invitation a rejoindre ${org?.name || 'votre organisation'} sur LOXAM`,
            html: emailHtml,
          });
        } catch (emailError) {
          console.error('Error resending invitation email:', emailError);
        }
      }

      return NextResponse.json({ success: true, message: 'Invitation resent' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Invitation PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
