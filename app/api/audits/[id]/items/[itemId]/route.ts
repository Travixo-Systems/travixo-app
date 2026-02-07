// =============================================================================
// Audit Item Update API - PATCH (mark verified/missing during audit)
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { validateRequest, updateAuditItemSchema } from '@/lib/validations/schemas';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: auditId, itemId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's org
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Validate request body
    const body = await request.json();
    const validation = validateRequest(updateAuditItemSchema, body);
    if (!validation.success) return validation.error;

    const { status, notes } = validation.data;

    // Verify the audit belongs to user's org and is in_progress
    const { data: audit } = await supabase
      .from('audits')
      .select('id, status, organization_id, verified_assets, missing_assets')
      .eq('id', auditId)
      .eq('organization_id', userData.organization_id)
      .single();

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    if (audit.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Audit must be in progress to update items' },
        { status: 400 }
      );
    }

    // Get current item status before updating
    const { data: currentItem } = await supabase
      .from('audit_items')
      .select('status')
      .eq('id', itemId)
      .eq('audit_id', auditId)
      .single();

    if (!currentItem) {
      return NextResponse.json({ error: 'Audit item not found' }, { status: 404 });
    }

    // Update the audit item
    const updateData: Record<string, unknown> = { status };
    if (status === 'verified') {
      updateData.verified_at = new Date().toISOString();
      updateData.verified_by = user.id;
    }
    if (notes) {
      updateData.notes = notes;
    }

    const { error: updateError } = await supabase
      .from('audit_items')
      .update(updateData)
      .eq('id', itemId)
      .eq('audit_id', auditId);

    if (updateError) {
      console.error('Error updating audit item:', updateError);
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
    }

    // Update parent audit counts
    let verifiedDelta = 0;
    let missingDelta = 0;

    // Remove from previous count
    if (currentItem.status === 'verified') verifiedDelta--;
    if (currentItem.status === 'missing') missingDelta--;

    // Add to new count
    if (status === 'verified') verifiedDelta++;
    if (status === 'missing') missingDelta++;

    if (verifiedDelta !== 0 || missingDelta !== 0) {
      await supabase
        .from('audits')
        .update({
          verified_assets: Math.max(0, audit.verified_assets + verifiedDelta),
          missing_assets: Math.max(0, audit.missing_assets + missingDelta),
        })
        .eq('id', auditId);
    }

    return NextResponse.json({
      success: true,
      item: { id: itemId, status, verified_at: updateData.verified_at || null },
    });
  } catch (error) {
    console.error('Audit item PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
