// =============================================================================
// Team Invitation Accept API - POST (accept invitation by token)
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient as createSessionClient } from '@/lib/supabase/server';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// =============================================================================
// POST /api/team/invitations/accept - Accept an invitation
// Body: { token: string }
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, access_token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const hashedToken = hashToken(token);

    // Use service role to look up the invitation (bypasses RLS)
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Find the invitation by hashed token
    const { data: invitation, error: inviteError } = await serviceClient
      .from('team_invitations')
      .select('*')
      .eq('token', hashedToken)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation.' },
        { status: 404 }
      );
    }

    // Look up the organization name for display
    const { data: org } = await serviceClient
      .from('organizations')
      .select('name')
      .eq('id', invitation.organization_id)
      .single();

    const orgName = org?.name || 'the organization';

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      await serviceClient
        .from('team_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return NextResponse.json(
        { error: 'This invitation has expired. Please ask the administrator to send a new one.' },
        { status: 410 }
      );
    }

    // Resolve the authenticated user — try access_token first (for fresh signup),
    // then fall back to session cookies (for normal login/page visit)
    let user = null;

    if (access_token) {
      // Verify the access token directly with Supabase
      const { data: { user: tokenUser } } = await serviceClient.auth.getUser(access_token);
      user = tokenUser;
    }

    if (!user) {
      // Fall back to session cookies
      const sessionClient = await createSessionClient();
      const { data: { user: sessionUser } } = await sessionClient.auth.getUser();
      user = sessionUser;
    }

    if (!user) {
      // User not logged in - return info so the page can redirect to signup
      return NextResponse.json({
        requiresAuth: true,
        email: invitation.email,
        organizationName: orgName,
        role: invitation.role,
      });
    }

    // Verify the authenticated user's email matches the invitation
    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json(
        {
          error: 'email_mismatch',
          invitedEmail: invitation.email,
          currentEmail: user.email,
          organizationName: orgName,
        },
        { status: 403 }
      );
    }

    // Check if user already belongs to a DIFFERENT org
    const { data: existingUser } = await serviceClient
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (existingUser?.organization_id && existingUser.organization_id !== invitation.organization_id) {
      return NextResponse.json(
        { error: 'Your account is already associated with another organization.' },
        { status: 409 }
      );
    }

    // Assign user to the organization — use upsert to handle fresh signups
    // where the users record may not exist yet
    const { error: upsertError } = await serviceClient
      .from('users')
      .upsert({
        id: user.id,
        email: user.email!,
        full_name: user.user_metadata?.full_name || user.email!.split('@')[0],
        organization_id: invitation.organization_id,
        role: invitation.role,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (upsertError) {
      console.error('Error assigning user to org:', upsertError);
      return NextResponse.json({ error: 'Failed to join organization' }, { status: 500 });
    }

    // Mark invitation as accepted
    await serviceClient
      .from('team_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    return NextResponse.json({
      success: true,
      message: 'You have joined the organization.',
      redirectTo: '/dashboard',
    });
  } catch (error) {
    console.error('Invitation accept error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
