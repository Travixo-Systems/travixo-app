// =============================================================================
// Team Invitations API - POST (create) and GET (list)
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, createHash } from 'crypto';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { TeamInvitationEmail } from '@/lib/email/templates/team-invitation';
import { validateRequest, inviteTeamMemberSchema } from '@/lib/validations/schemas';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.travixosystems.com';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// =============================================================================
// GET /api/team/invitations - List pending invitations for the org
// =============================================================================

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { data: invitations, error } = await supabase
      .from('team_invitations')
      .select('id, email, role, status, created_at, expires_at, invited_by')
      .eq('organization_id', userData.organization_id)
      .in('status', ['pending', 'expired'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invitations:', error);
      return NextResponse.json({ error: 'Failed to fetch invitations' }, { status: 500 });
    }

    return NextResponse.json({ invitations: invitations || [] });
  } catch (error) {
    console.error('Invitations GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// POST /api/team/invitations - Create and send a new invitation
// =============================================================================

export async function POST(request: NextRequest) {
  try {
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

    // Only owner/admin can invite
    if (!['owner', 'admin'].includes(userData.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only owners and admins can invite members.' },
        { status: 403 }
      );
    }

    // Validate input
    const body = await request.json();
    const validation = validateRequest(inviteTeamMemberSchema, body);
    if (!validation.success) return validation.error;

    const { email, role } = validation.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Prevent self-invitation
    if (normalizedEmail === userData.email) {
      return NextResponse.json(
        { error: 'You cannot invite yourself.' },
        { status: 400 }
      );
    }

    // Check if user already exists in this org
    const { data: existingMember } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .eq('organization_id', userData.organization_id)
      .single();

    if (existingMember) {
      return NextResponse.json(
        { error: 'This user is already a member of your organization.' },
        { status: 409 }
      );
    }

    // Check if email is associated with another org (MVP: one org per user)
    // Need service role client to bypass RLS for cross-org check
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: otherOrgUser } = await serviceClient
      .from('users')
      .select('id, organization_id')
      .eq('email', normalizedEmail)
      .not('organization_id', 'is', null)
      .single();

    if (otherOrgUser && otherOrgUser.organization_id !== userData.organization_id) {
      return NextResponse.json(
        { error: 'This email is already associated with another organization.' },
        { status: 409 }
      );
    }

    // Check for existing pending invitation
    const { data: existingInvite } = await supabase
      .from('team_invitations')
      .select('id')
      .eq('email', normalizedEmail)
      .eq('organization_id', userData.organization_id)
      .eq('status', 'pending')
      .single();

    if (existingInvite) {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email.' },
        { status: 409 }
      );
    }

    // Generate secure token - store hash, send plaintext
    const plainToken = randomUUID();
    const hashedToken = hashToken(plainToken);

    // Get org name for the email
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', userData.organization_id)
      .single();

    const orgName = org?.name || 'Your organization';

    // Insert invitation record
    const { data: invitation, error: insertError } = await supabase
      .from('team_invitations')
      .insert({
        organization_id: userData.organization_id,
        email: normalizedEmail,
        role,
        token: hashedToken,
        invited_by: user.id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error creating invitation:', insertError);
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
    }

    // Send invitation email via Resend
    if (RESEND_API_KEY) {
      try {
        const resend = new Resend(RESEND_API_KEY);
        const acceptUrl = `${APP_URL}/accept-invite/${plainToken}`;

        const emailHtml = await render(
          TeamInvitationEmail({
            organizationName: orgName,
            inviterEmail: userData.email,
            role,
            acceptUrl,
            appUrl: APP_URL,
          })
        );

        await resend.emails.send({
          from: 'TraviXO Systems <noreply@travixosystems.com>',
          replyTo: 'contact@travixosystems.com',
          to: normalizedEmail,
          subject: `Invitation a rejoindre ${orgName} sur TraviXO`,
          html: emailHtml,
        });
      } catch (emailError) {
        console.error('Error sending invitation email:', emailError);
        // Don't fail the request - invitation is created, email can be resent
      }
    }

    return NextResponse.json(
      { success: true, invitation: { id: invitation.id, email: normalizedEmail, role } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Invitations POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
