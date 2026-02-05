// ============================================================================
// FILE: app/api/team/route.ts
// PURPOSE: Team management API - list members, invite, change role, remove
// COPY TO: your-project/app/api/team/route.ts
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// GET /api/team - List all team members for the organization
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's organization
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Fetch team members
    const { data: members, error: membersError } = await supabase
      .from('users')
      .select('*')
      .eq('organization_id', userData.organization_id)
      .order('role', { ascending: true })
      .order('created_at', { ascending: true });

    if (membersError) {
      console.error('Error fetching team members:', membersError);
      return NextResponse.json(
        { error: 'Failed to fetch team members' },
        { status: 500 }
      );
    }

    // Calculate stats
    const stats = {
      total: members?.length || 0,
      admins: members?.filter(m => m.role === 'admin' || m.role === 'owner').length || 0,
      members: members?.filter(m => m.role === 'member').length || 0,
      viewers: members?.filter(m => m.role === 'viewer').length || 0,
    };

    return NextResponse.json({
      members: members || [],
      stats,
      currentUserId: user.id,
    });
  } catch (error) {
    console.error('Team GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/team - Invite a new team member
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's organization and role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Only owner and admin can invite members
    if (!['owner', 'admin'].includes(userData.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only owners and admins can invite members.' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { email, role } = body;

    // Validate email
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Valid email address is required' },
        { status: 400 }
      );
    }

    // Validate role
    if (!role || !['admin', 'member', 'viewer'].includes(role)) {
      return NextResponse.json(
        { error: 'Valid role is required (admin, member, or viewer)' },
        { status: 400 }
      );
    }

    // Check if user already exists in the organization
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .eq('organization_id', userData.organization_id)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: 'This user is already a member of your organization' },
        { status: 409 }
      );
    }

    // For now, return a message that the invitation system needs backend setup
    // In production, this would:
    // 1. Create an invitation record in team_invitations table
    // 2. Generate a unique invitation token
    // 3. Send an invitation email via Resend
    // 4. The recipient clicks the link to accept and create their account

    // Placeholder response - actual implementation would create the invitation
    return NextResponse.json({
      success: true,
      message: 'Invitation system ready for backend integration',
      note: 'Create team_invitations table and integrate with Resend email service',
      invitation: {
        email: email.toLowerCase().trim(),
        role,
        invited_by: user.id,
        organization_id: userData.organization_id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Team POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/team - Update a team member's role
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's organization and role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Only owner and admin can change roles
    if (!['owner', 'admin'].includes(userData.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { memberId, role } = body;

    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      );
    }

    if (!role || !['admin', 'member', 'viewer'].includes(role)) {
      return NextResponse.json(
        { error: 'Valid role is required (admin, member, or viewer)' },
        { status: 400 }
      );
    }

    // Prevent changing own role
    if (memberId === user.id) {
      return NextResponse.json(
        { error: 'You cannot change your own role' },
        { status: 400 }
      );
    }

    // Get the target member
    const { data: targetMember } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', memberId)
      .single();

    if (!targetMember || targetMember.organization_id !== userData.organization_id) {
      return NextResponse.json(
        { error: 'Member not found in your organization' },
        { status: 404 }
      );
    }

    // Prevent changing owner's role
    if (targetMember.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot change the owner\'s role' },
        { status: 403 }
      );
    }

    // Admins cannot promote to admin (only owner can)
    if (userData.role === 'admin' && role === 'admin') {
      return NextResponse.json(
        { error: 'Only the owner can promote members to admin' },
        { status: 403 }
      );
    }

    // Update the role
    const { data: updatedMember, error: updateError } = await supabase
      .from('users')
      .update({ 
        role, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', memberId)
      .eq('organization_id', userData.organization_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating member role:', updateError);
      return NextResponse.json(
        { error: 'Failed to update member role' },
        { status: 500 }
      );
    }

    return NextResponse.json({ member: updatedMember });
  } catch (error) {
    console.error('Team PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/team - Remove a team member
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's organization and role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Only owner and admin can remove members
    if (!['owner', 'admin'].includes(userData.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get member ID from query params
    const searchParams = request.nextUrl.searchParams;
    const memberId = searchParams.get('memberId');

    if (!memberId) {
      return NextResponse.json(
        { error: 'Member ID is required' },
        { status: 400 }
      );
    }

    // Prevent removing yourself
    if (memberId === user.id) {
      return NextResponse.json(
        { error: 'You cannot remove yourself from the organization' },
        { status: 400 }
      );
    }

    // Get the target member
    const { data: targetMember } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', memberId)
      .single();

    if (!targetMember || targetMember.organization_id !== userData.organization_id) {
      return NextResponse.json(
        { error: 'Member not found in your organization' },
        { status: 404 }
      );
    }

    // Prevent removing the owner
    if (targetMember.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove the organization owner' },
        { status: 403 }
      );
    }

    // Admins cannot remove other admins (only owner can)
    if (userData.role === 'admin' && targetMember.role === 'admin') {
      return NextResponse.json(
        { error: 'Only the owner can remove admin members' },
        { status: 403 }
      );
    }

    // Remove the member by setting their organization_id to null
    // This preserves the user account but removes org access
    const { error: removeError } = await supabase
      .from('users')
      .update({ 
        organization_id: null, 
        role: 'member',
        updated_at: new Date().toISOString() 
      })
      .eq('id', memberId);

    if (removeError) {
      console.error('Error removing member:', removeError);
      return NextResponse.json(
        { error: 'Failed to remove member' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Team DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}